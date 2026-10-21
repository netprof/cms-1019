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
        decimal? cost = null, string? sessionId = null, string? sessionName = null) =>
        _repository.Seed(new TokenUsage
        {
            SessionId = sessionId ?? $"s-{Interlocked.Increment(ref _session)}",
            UsageDate = DateOnly.Parse(date),
            Model = model,
            UserId = userId,
            Project = project,
            SessionName = sessionName,
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

    // ---- by session ----

    private const string SessionRoute = "/api/tokenusages/report/sessions";

    private async Task<HttpResponseMessage> PostSessionsAsync(object query) =>
        await _factory.CreateAuthenticatedClient().PostAsJsonAsync(SessionRoute, query);

    private async Task<TokenUsageSessionReport> SessionReportAsync(object query)
    {
        var response = await PostSessionsAsync(query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TokenUsageSessionReport>(Json))!;
    }

    [Fact]
    public async Task Sessions_SumOneSessionAcrossDatesAndModels_IntoOneRow()
    {
        Seed("2026-10-19", sessionId: "a", sessionName: "修正登入", model: "claude-opus-5-5", input: 1, read: 10, output: 100, cost: 1m);
        Seed("2026-10-20", sessionId: "a", sessionName: "修正登入", model: "claude-opus-5-5", input: 2, read: 20, output: 200, cost: null);
        Seed("2026-10-20", sessionId: "a", sessionName: "修正登入", model: "claude-haiku-5-5", input: 4, read: 40, output: 400, cost: 0.5m);
        Seed("2026-10-20", sessionId: "b");

        var response = await PostSessionsAsync(new { });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var row = json.RootElement.GetProperty("items").EnumerateArray().Single(r => r.GetProperty("sessionId").GetString() == "a");
        Assert.Equal(("修正登入", "helen", "Helen Wu", "netprof/cms", "2026-10-19", "2026-10-20", "claude-haiku-5-5, claude-opus-5-5"),
            (row.GetProperty("sessionName").GetString(), row.GetProperty("userId").GetString(),
             row.GetProperty("userName").GetString(), row.GetProperty("project").GetString(),
             row.GetProperty("firstDate").GetString(), row.GetProperty("lastDate").GetString(),
             row.GetProperty("models").GetString()));
        Assert.Equal((7L, 70L, 700L, 77L, 1.5m),
            (row.GetProperty("inputTokens").GetInt64(), row.GetProperty("cacheReadTokens").GetInt64(),
             row.GetProperty("outputTokens").GetInt64(), row.GetProperty("tokenIn").GetInt64(),
             row.GetProperty("cost").GetDecimal()));
        Assert.Equal(2, json.RootElement.GetProperty("totalRecords").GetInt32());
    }

    [Fact]
    public async Task Sessions_UnnamedSession_HasNullName()
    {
        Seed("2026-10-20", sessionId: "a");

        var report = await SessionReportAsync(new { });

        Assert.Null(Assert.Single(report.Items).SessionName);
    }

    [Fact]
    public async Task Sessions_FiltersApplyBeforeSumming()
    {
        Seed("2026-10-18", sessionId: "a", input: 1);
        Seed("2026-10-19", sessionId: "a", input: 10);
        Seed("2026-10-20", sessionId: "a", model: "claude-haiku-5-5", input: 100);

        var report = await SessionReportAsync(new { from = "2026-10-19", model = "opus" });

        var row = Assert.Single(report.Items);
        Assert.Equal((10L, new DateOnly(2026, 10, 19), new DateOnly(2026, 10, 19), "claude-opus-5-5"),
            (row.InputTokens, row.FirstDate, row.LastDate, row.Models));
        Assert.Equal(10L, report.Totals.InputTokens);
    }

    [Fact]
    public async Task Sessions_SessionNameFilter_MatchesContains_AndSkipsUnnamed()
    {
        Seed("2026-10-20", sessionId: "a", sessionName: "Fix LOGIN bug");
        Seed("2026-10-20", sessionId: "b", sessionName: "Add report");
        Seed("2026-10-20", sessionId: "c");

        var report = await SessionReportAsync(new { sessionName = "login" });

        Assert.Equal("a", Assert.Single(report.Items).SessionId);
    }

    [Fact]
    public async Task Sessions_DefaultToNewestLastDateFirst_TwentyRows()
    {
        for (var day = 1; day <= 25; day++) Seed($"2026-10-{day:00}", sessionId: $"s{day:00}");

        var report = await SessionReportAsync(new { });

        Assert.Equal(25, report.TotalRecords);
        Assert.Equal(20, report.Items.Count);
        Assert.Equal(("s25", "s06"), (report.Items[0].SessionId, report.Items[^1].SessionId));
    }

    [Fact]
    public async Task Sessions_SortBySessionName_BreaksTiesByLastDateThenSessionId()
    {
        Seed("2026-10-19", sessionId: "c", sessionName: "b");
        Seed("2026-10-20", sessionId: "b", sessionName: "a");
        Seed("2026-10-20", sessionId: "a", sessionName: "a");
        Seed("2026-10-19", sessionId: "d", sessionName: "a");

        var report = await SessionReportAsync(new { sortField = "sessionName", sortOrder = 1 });

        Assert.Equal(["a", "b", "d", "c"], report.Items.Select(r => r.SessionId));
    }

    [Theory]
    [InlineData("usageDate")] // a column of the other report
    [InlineData("model")]
    public async Task Sessions_UnknownSortField_Returns400(string sortField)
    {
        var response = await PostSessionsAsync(new { sortField });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Sessions_DateFromAfterTo_Returns400()
    {
        var response = await PostSessionsAsync(new { from = "2026-10-20", to = "2026-10-19" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- pivot ----

    private const string PivotRoute = Route + "/pivot";

    private async Task<HttpResponseMessage> PostPivotAsync(object query) =>
        await _factory.CreateAuthenticatedClient().PostAsJsonAsync(PivotRoute, query);

    private async Task<TokenUsagePivot> PivotAsync(object query)
    {
        var response = await PostPivotAsync(query);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<TokenUsagePivot>(Json))!;
    }

    [Fact]
    public async Task Pivot_DefaultsToUsersByMonth_WithCellsAndTotals()
    {
        Seed("2026-09-30", userId: "helen", input: 1, output: 10, cost: 1m);
        Seed("2026-10-01", userId: "helen", input: 2, read: 3, output: 20, cost: 2m);
        Seed("2026-10-20", userId: "helen", model: "claude-haiku-5", input: 4);
        Seed("2026-10-20", userId: "jenny", input: 8, cost: 0.5m);

        var pivot = await PivotAsync(new { });

        Assert.Equal(["2026-09", "2026-10"], pivot.Columns.Select(c => c.Key));
        Assert.Equal(["2026-09", "2026-10"], pivot.Columns.Select(c => c.Label));
        Assert.Equal(["helen", "jenny"], pivot.Rows.Select(r => r.Key));
        Assert.Equal(["Helen Wu", "Jenny Lin"], pivot.Rows.Select(r => r.Label));
        Assert.Equal(["helen", "jenny"], pivot.Rows.Select(r => r.Title));

        var helen = pivot.Rows[0];
        Assert.Equal(1, helen.Cells["2026-09"].InputTokens);
        var october = helen.Cells["2026-10"]; // both models summed
        Assert.Equal((6L, 3L, 9L, 20L, 2m), (october.InputTokens, october.CacheReadTokens, october.TokenIn, october.OutputTokens, october.Cost));
        Assert.Equal((7L, 3m), (helen.Total.InputTokens, helen.Total.Cost));

        Assert.False(pivot.Rows[1].Cells.ContainsKey("2026-09")); // no data, no cell
        Assert.Equal([1L, 14L], pivot.Columns.Select(c => c.Total.InputTokens));
        Assert.Equal((15L, 3.5m), (pivot.Total.InputTokens, pivot.Total.Cost));
    }

    [Fact]
    public async Task Pivot_WithoutColumnDimension_HasRowTotalsOnly()
    {
        Seed("2026-10-20", project: "netprof/cms", input: 1);
        Seed("2026-10-21", project: "netprof/other", input: 2);

        var pivot = await PivotAsync(new { rowDim = "project", colDim = (string?)null });

        Assert.Empty(pivot.Columns);
        Assert.Equal(["netprof/cms", "netprof/other"], pivot.Rows.Select(r => r.Label));
        Assert.All(pivot.Rows, r => Assert.Empty(r.Cells));
        Assert.All(pivot.Rows, r => Assert.Null(r.Title));
        Assert.Equal([1L, 2L], pivot.Rows.Select(r => r.Total.InputTokens));
        Assert.Equal(3L, pivot.Total.InputTokens);
    }

    [Fact]
    public async Task Pivot_ModelsByDay_LabelsDaysAscending()
    {
        Seed("2026-10-21", model: "claude-opus-5-5");
        Seed("2026-10-20", model: "claude-haiku-5");

        var pivot = await PivotAsync(new { rowDim = "model", colDim = "date", dateGrain = "day" });

        Assert.Equal(["2026-10-20", "2026-10-21"], pivot.Columns.Select(c => c.Key));
        Assert.All(pivot.Columns, c => Assert.Null(c.Title));
        Assert.Equal(["claude-haiku-5", "claude-opus-5-5"], pivot.Rows.Select(r => r.Key));
    }

    [Fact]
    public async Task Pivot_WeekGrain_UsesIsoWeeks_AcrossTheYearBoundary()
    {
        Seed("2026-12-27", input: 1); // Sunday of 2026-W52
        Seed("2026-12-28", input: 2); // Monday of 2026-W53
        Seed("2027-01-03", input: 4); // Sunday, still 2026-W53
        Seed("2027-01-04", input: 8); // Monday of 2027-W01

        var pivot = await PivotAsync(new { rowDim = "date", colDim = (string?)null, dateGrain = "week" });

        Assert.Equal(["2026-W52", "2026-W53", "2027-W01"], pivot.Rows.Select(r => r.Label));
        Assert.Equal(["2026-12-21 ~ 2026-12-27", "2026-12-28 ~ 2027-01-03", "2027-01-04 ~ 2027-01-10"],
            pivot.Rows.Select(r => r.Title));
        Assert.Equal([1L, 6L, 8L], pivot.Rows.Select(r => r.Total.InputTokens));
    }

    [Fact]
    public async Task Pivot_Cost_IsNullOnlyWhereNothingIsPriced()
    {
        Seed("2026-10-20", model: "claude-opus-5-5", cost: 1.25m);
        Seed("2026-10-20", model: "claude-opus-5-5", cost: null);
        Seed("2026-10-20", model: "claude-new", cost: null);

        var pivot = await PivotAsync(new { rowDim = "model", colDim = "user" });

        Assert.Equal([null, 1.25m], pivot.Rows.Select(r => r.Total.Cost));
        Assert.Null(pivot.Rows[0].Cells["helen"].Cost);
        Assert.Equal(1.25m, pivot.Columns.Single().Total.Cost);
        Assert.Equal(1.25m, pivot.Total.Cost);
    }

    [Fact]
    public async Task Pivot_AppliesTheReportFilters()
    {
        Seed("2026-10-19", input: 1);
        Seed("2026-10-20", input: 2);
        Seed("2026-10-20", userId: "jenny", input: 4);
        Seed("2026-10-20", model: "claude-haiku-5", input: 8);

        var pivot = await PivotAsync(new { from = "2026-10-20", userId = "helen", model = "opus" });

        Assert.Equal(2L, pivot.Total.InputTokens);
    }

    [Fact]
    public async Task Pivot_NoMatchingRows_IsEmpty()
    {
        var pivot = await PivotAsync(new { });

        Assert.Empty(pivot.Rows);
        Assert.Empty(pivot.Columns);
        Assert.Equal((0L, (decimal?)null), (pivot.Total.InputTokens, pivot.Total.Cost));
    }

    [Fact]
    public async Task Pivot_IgnoresDateGrain_WhenNoAxisIsDate()
    {
        Seed("2026-10-20");

        var pivot = await PivotAsync(new { rowDim = "user", colDim = "model", dateGrain = "year" });

        Assert.Single(pivot.Rows);
    }

    public static TheoryData<object> InvalidPivotQueries => new()
    {
        new { rowDim = "session" },
        new { rowDim = (string?)null },
        new { colDim = "usageDate" },
        new { rowDim = "model", colDim = "model" },
        new { rowDim = "date", colDim = "user", dateGrain = "year" },
        new { rowDim = "user", colDim = "date", dateGrain = (string?)null },
        new { from = "2026-10-20", to = "2026-10-19" },
    };

    [Theory]
    [MemberData(nameof(InvalidPivotQueries))]
    public async Task Pivot_InvalidQuery_Returns400(object query)
    {
        var response = await PostPivotAsync(query);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
