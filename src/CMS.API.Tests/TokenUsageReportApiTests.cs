using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

public class TokenUsageReportApiTests : IClassFixture<ApiTestFactory>
{
    private const string Route = "/api/tokenusages/report";

    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeTokenUsageRepository _repository = new();

    public TokenUsageReportApiTests(ApiTestFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<ITokenUsageRepository>();
            services.AddSingleton<ITokenUsageRepository>(_repository);
            services.RemoveAll<IModelPriceRepository>(); // the controller also prices ingest; the report never does
            services.AddSingleton<IModelPriceRepository>(new FakeModelPriceRepository());
        }));
    }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private static int _session;

    /// <summary>Stores one (session, date, model) row; every call is a new session unless one is given.</summary>
    private void Seed(string date, string userId = "helen", string project = "netprof/cms", string model = "claude-opus-5-5",
        long input = 1, long write5m = 0, long write1h = 0, long read = 0, long output = 0,
        decimal? cost = null, string? sessionId = null) =>
        _repository.Seed(new TokenUsage
        {
            SessionId = sessionId ?? $"s-{Interlocked.Increment(ref _session)}",
            UsageDate = DateOnly.Parse(date),
            Model = model,
            UserId = userId,
            Project = project,
            InputTokens = input,
            CacheWrite5mTokens = write5m,
            CacheWrite1hTokens = write1h,
            CacheReadTokens = read,
            OutputTokens = output,
            Cost = cost,
            UpdatedTime = DateTime.UtcNow,
        });

    private async Task<HttpResponseMessage> PostAsync(object query) =>
        await _factory.CreateAuthenticatedClient().PostAsJsonAsync(Route, query);

    private async Task<TokenUsageReport> ReportAsync(object query)
    {
        var response = await PostAsync(query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TokenUsageReport>(Json))!;
    }

    // ---- aggregation ----

    [Fact]
    public async Task Report_SumsSessionsSharingUserDateProjectModel_IntoOneRow()
    {
        Seed("2026-10-20", input: 1, write5m: 2, write1h: 3, read: 4, output: 5);
        Seed("2026-10-20", input: 10, write5m: 20, write1h: 30, read: 40, output: 50);

        var response = await PostAsync(new { });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = Assert.Single(json.RootElement.GetProperty("items").EnumerateArray());
        Assert.Equal(("2026-10-20", "helen", "Helen Wu", "netprof/cms", "claude-opus-5-5"),
            (row.GetProperty("usageDate").GetString(), row.GetProperty("userId").GetString(),
             row.GetProperty("userName").GetString(), row.GetProperty("project").GetString(),
             row.GetProperty("model").GetString()));
        Assert.Equal([11L, 22L, 33L, 44L, 55L],
            new[] { "inputTokens", "cacheWrite5mTokens", "cacheWrite1hTokens", "cacheReadTokens", "outputTokens" }
                .Select(p => row.GetProperty(p).GetInt64()));
        Assert.Equal(110L, row.GetProperty("tokenIn").GetInt64()); // input + both cache writes + cache read, not output
        Assert.Equal(JsonValueKind.Null, row.GetProperty("cost").ValueKind);
    }

    [Fact]
    public async Task Report_KeepsDifferentUsersDatesProjectsAndModels_Apart()
    {
        Seed("2026-10-20");
        Seed("2026-10-20", userId: "jenny");
        Seed("2026-10-19");
        Seed("2026-10-20", project: "netprof/other");
        Seed("2026-10-20", model: "claude-haiku-5");

        var report = await ReportAsync(new { });

        Assert.Equal(5, report.TotalRecords);
        Assert.Equal(5, report.Items.Count);
    }

    [Fact]
    public async Task Report_SumsCost_IgnoringUnpricedRows()
    {
        Seed("2026-10-20", cost: 1.25m);
        Seed("2026-10-20", cost: null);
        Seed("2026-10-20", cost: 0.5m);

        var report = await ReportAsync(new { });

        Assert.Equal(1.75m, Assert.Single(report.Items).Cost);
    }

    // ---- filters ----

    [Fact]
    public async Task Report_DateRange_IsInclusiveOnBothEnds()
    {
        foreach (var date in new[] { "2026-10-01", "2026-10-02", "2026-10-15", "2026-10-16" })
            Seed(date);

        var report = await ReportAsync(new { from = "2026-10-02", to = "2026-10-15" });

        Assert.Equal([new DateOnly(2026, 10, 2), new DateOnly(2026, 10, 15)],
            report.Items.Select(r => r.UsageDate).Order());
    }

    [Fact]
    public async Task Report_UserFilter_MatchesExactUserId()
    {
        Seed("2026-10-20", userId: "helen");
        Seed("2026-10-20", userId: "jenny");

        var report = await ReportAsync(new { userId = "jenny" });

        Assert.Equal("jenny", Assert.Single(report.Items).UserId);
    }

    [Fact]
    public async Task Report_ProjectFilter_MatchesContains()
    {
        Seed("2026-10-20", project: "netprof/cms");
        Seed("2026-10-20", project: "netprof/cms-1019");
        Seed("2026-10-20", project: "acme/web");

        var report = await ReportAsync(new { project = "cms" });

        Assert.Equal(["netprof/cms", "netprof/cms-1019"], report.Items.Select(r => r.Project).Order());
    }

    [Fact]
    public async Task Report_ModelFilter_MatchesContains()
    {
        Seed("2026-10-20", model: "claude-opus-5-5");
        Seed("2026-10-20", model: "claude-opus-5");
        Seed("2026-10-20", model: "claude-haiku-5");

        var report = await ReportAsync(new { model = "opus" });

        Assert.Equal(["claude-opus-5", "claude-opus-5-5"], report.Items.Select(r => r.Model).Order());
    }

    // ---- totals ----

    [Fact]
    public async Task Report_Totals_CoverWholeFilteredSet_NotJustThePage()
    {
        Seed("2026-10-18", input: 1, write5m: 2, write1h: 3, read: 4, output: 5, cost: 1m);
        Seed("2026-10-19", input: 10, write5m: 20, write1h: 30, read: 40, output: 50, cost: null);
        Seed("2026-10-20", input: 100, write5m: 200, write1h: 300, read: 400, output: 500, cost: 2.5m);
        Seed("2026-10-20", userId: "jenny", input: 9999, cost: 99m); // filtered out

        var report = await ReportAsync(new { userId = "helen", first = 0, rows = 1 });

        Assert.Single(report.Items);
        Assert.Equal(3, report.TotalRecords);
        var t = report.Totals;
        Assert.Equal([111L, 222L, 333L, 444L, 555L],
            [t.InputTokens, t.CacheWrite5mTokens, t.CacheWrite1hTokens, t.CacheReadTokens, t.OutputTokens]);
        Assert.Equal(3.5m, t.Cost);

        using var json = JsonDocument.Parse(await (await PostAsync(new { userId = "helen" })).Content.ReadAsStringAsync());
        Assert.Equal(1110L, json.RootElement.GetProperty("totals").GetProperty("tokenIn").GetInt64());
    }

    [Fact]
    public async Task Report_Totals_AreZeroWithNullCost_WhenNothingIsPriced()
    {
        Seed("2026-10-20", input: 5);

        var report = await ReportAsync(new { });

        Assert.Equal(5L, report.Totals.InputTokens);
        Assert.Null(report.Totals.Cost);
    }

    [Fact]
    public async Task Report_NoMatchingRows_ReturnsEmptyPageAndZeroTotals()
    {
        var report = await ReportAsync(new { });

        Assert.Empty(report.Items);
        Assert.Equal(0, report.TotalRecords);
        Assert.Equal(0L, report.Totals.InputTokens);
        Assert.Null(report.Totals.Cost);
    }

    // ---- paging and sorting ----

    private void SeedDays(int count)
    {
        for (var day = 1; day <= count; day++) Seed($"2026-10-{day:00}", input: day);
    }

    [Fact]
    public async Task Report_Pages_WithFirstAndRows()
    {
        SeedDays(25);

        var report = await ReportAsync(new { first = 20, rows = 10, sortField = "usageDate", sortOrder = 1 });

        Assert.Equal(25, report.TotalRecords);
        Assert.Equal(Enumerable.Range(21, 5).Select(d => new DateOnly(2026, 10, d)), report.Items.Select(r => r.UsageDate));
    }

    [Fact]
    public async Task Report_DefaultsToNewestDateFirst_TwentyRows()
    {
        SeedDays(25);

        var report = await ReportAsync(new { });

        Assert.Equal(20, report.Items.Count);
        Assert.Equal(new DateOnly(2026, 10, 25), report.Items[0].UsageDate);
        Assert.Equal(new DateOnly(2026, 10, 6), report.Items[^1].UsageDate);
    }

    [Theory]
    [InlineData("tokenIn", 1, new long[] { 1, 2, 3 })]
    [InlineData("tokenIn", -1, new long[] { 3, 2, 1 })]
    [InlineData("inputTokens", -1, new long[] { 3, 2, 1 })]
    public async Task Report_SortsByRequestedField(string sortField, int sortOrder, long[] expectedInputs)
    {
        Seed("2026-10-20", input: 2);
        Seed("2026-10-18", input: 3);
        Seed("2026-10-19", input: 1);

        var report = await ReportAsync(new { sortField, sortOrder });

        Assert.Equal(expectedInputs, report.Items.Select(r => r.InputTokens));
    }

    [Fact]
    public async Task Report_SortsByText_AndBreaksTiesByDateUserProjectModel()
    {
        Seed("2026-10-20", userId: "jenny", model: "b");
        Seed("2026-10-20", userId: "helen", model: "b");
        Seed("2026-10-19", userId: "helen", model: "a");
        Seed("2026-10-20", userId: "helen", model: "a");

        var report = await ReportAsync(new { sortField = "userName", sortOrder = 1 });

        Assert.Equal(
            [("helen", "2026-10-20", "a"), ("helen", "2026-10-20", "b"), ("helen", "2026-10-19", "a"), ("jenny", "2026-10-20", "b")],
            report.Items.Select(r => (r.UserId, r.UsageDate.ToString("yyyy-MM-dd"), r.Model)));
    }

    public static TheoryData<object> InvalidPaging => new()
    {
        new { sortField = "sessionId" },
        new { sortField = "cost; DROP TABLE TokenUsage" },
        new { sortOrder = 0 },
        new { first = -1 },
        new { rows = 0 },
        new { rows = 501 },
    };

    [Theory]
    [MemberData(nameof(InvalidPaging))]
    public async Task Report_InvalidPagingOrSort_Returns400(object query)
    {
        var response = await PostAsync(query);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.NotNull(await response.Content.ReadFromJsonAsync<ValidationProblemDetails>());
    }

    [Fact]
    public async Task Report_DateFromAfterTo_Returns400()
    {
        var response = await PostAsync(new { from = "2026-10-20", to = "2026-10-19" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
