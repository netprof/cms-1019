using System.Net;
using System.Net.Http.Json;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

public class TokenUsagesApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Route = "/api/tokenusages";

    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeTokenUsageRepository _repository = new();

    public TokenUsagesApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<ITokenUsageRepository>();
            services.AddSingleton<ITokenUsageRepository>(_repository);
            services.RemoveAll<IModelPriceRepository>(); // ingest prices rows; pricing itself is in TokenUsagePricingApiTests
            services.AddSingleton<IModelPriceRepository>(new FakeModelPriceRepository());
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(new FixedTimeProvider(Now));
        }));
    }

    /// <summary>2026-10-21 01:00 in Taipei (UTC+8): UTC and Taipei disagree on "today".</summary>
    private static readonly DateTimeOffset Now = new(2026, 10, 20, 17, 0, 0, TimeSpan.Zero);

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private static Dictionary<string, object?> Row(
        string? date = "2026-10-20", string? model = "claude-opus-5-5",
        long input = 10, long write5m = 20, long write1h = 30, long read = 40, long output = 50) => new()
    {
        ["date"] = date, ["model"] = model,
        ["inputTokens"] = input, ["cacheWrite5mTokens"] = write5m, ["cacheWrite1hTokens"] = write1h,
        ["cacheReadTokens"] = read, ["outputTokens"] = output,
    };

    private static Dictionary<string, object?> Payload(
        string? sessionId = "s-1", string? userId = "helen", string? project = "netprof/cms",
        Dictionary<string, object?>[]? rows = null) => new()
    {
        ["sessionId"] = sessionId, ["userId"] = userId, ["project"] = project,
        ["rows"] = rows ?? [Row()],
    };

    private async Task<HttpResponseMessage> PostAsync(object payload, string? apiKey = FakeTokenUsageRepository.ApiKey)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, Route) { Content = JsonContent.Create(payload) };
        if (apiKey is not null) request.Headers.Add("X-Api-Key", apiKey);
        return await _factory.CreateClient().SendAsync(request);
    }

    // ---- auth ----

    [Fact]
    public async Task Ingest_MissingApiKey_Returns401()
    {
        var response = await PostAsync(Payload(), apiKey: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Ingest_WrongApiKey_Returns401_EvenForInvalidPayload()
    {
        var response = await PostAsync(new { sessionId = "" }, apiKey: "wrong-key");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(_repository.Rows);
    }

    // ---- replace semantics ----

    [Fact]
    public async Task Ingest_NewSession_StoresRows()
    {
        var response = await PostAsync(Payload());

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var row = Assert.Single(_repository.Rows);
        Assert.Equal(("s-1", new DateOnly(2026, 10, 20), "claude-opus-5-5"), (row.SessionId, row.UsageDate, row.Model));
        Assert.Equal(("helen", "netprof/cms"), (row.UserId, row.Project));
        Assert.Equal([10L, 20L, 30L, 40L, 50L],
            [row.InputTokens, row.CacheWrite5mTokens, row.CacheWrite1hTokens, row.CacheReadTokens, row.OutputTokens]);
        Assert.Equal(DateTimeKind.Utc, row.UpdatedTime.Kind);
    }

    [Fact]
    public async Task Ingest_RepostedSession_ReplacesRows_AndLeavesOtherSessionsAlone()
    {
        await PostAsync(Payload(sessionId: "other"));
        await PostAsync(Payload(rows: [Row("2026-10-19", "claude-opus-5-5", input: 1), Row("2026-10-20", "claude-opus-5-5", input: 2)]));

        var response = await PostAsync(Payload(rows: [Row("2026-10-20", "claude-opus-5-5", input: 7), Row("2026-10-20", "claude-haiku-5", input: 3)]));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var session = _repository.Rows.Where(r => r.SessionId == "s-1")
            .OrderBy(r => r.UsageDate).ThenBy(r => r.Model).ToList();
        Assert.Equal(
            [(new DateOnly(2026, 10, 20), "claude-haiku-5", 3L), (new DateOnly(2026, 10, 20), "claude-opus-5-5", 7L)],
            session.Select(r => (r.UsageDate, r.Model, r.InputTokens)));
        Assert.Single(_repository.Rows, r => r.SessionId == "other");
    }

    [Fact]
    public async Task Ingest_EmptyRows_ClearsSession()
    {
        await PostAsync(Payload());

        var response = await PostAsync(Payload(rows: []));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Empty(_repository.Rows);
    }

    // ---- validation ----

    public static TheoryData<string, Dictionary<string, object?>> InvalidFields => new()
    {
        { "sessionId", Payload(sessionId: null) },
        { "sessionId", Payload(sessionId: "") },
        { "sessionId", Payload(sessionId: new string('s', 101)) },
        { "userId", Payload(userId: null) },
        { "userId", Payload(userId: new string('u', 201)) },
        { "project", Payload(project: null) },
        { "project", Payload(project: " ") },
        { "project", Payload(project: new string('p', 201)) },
        { "rows", new(Payload()) { ["rows"] = null } },
        { "model", Payload(rows: [Row(model: null)]) },
        { "model", Payload(rows: [Row(model: "")]) },
        { "model", Payload(rows: [Row(model: new string('m', 101))]) },
        { "date", Payload(rows: [Row(date: null)]) },
        { "inputTokens", Payload(rows: [Row(input: -1)]) },
        { "cacheWrite5mTokens", Payload(rows: [Row(write5m: -1)]) },
        { "cacheWrite1hTokens", Payload(rows: [Row(write1h: -1)]) },
        { "cacheReadTokens", Payload(rows: [Row(read: -1)]) },
        { "outputTokens", Payload(rows: [Row(output: -1)]) },
    };

    [Theory]
    [MemberData(nameof(InvalidFields))]
    public async Task Ingest_InvalidField_Returns400(string field, Dictionary<string, object?> payload)
    {
        var response = await PostAsync(payload);

        await AssertBadRequestAsync(response, field);
    }

    [Fact]
    public async Task Ingest_MaxLengthValues_AreAccepted()
    {
        var response = await PostAsync(Payload(sessionId: new string('s', 100), project: new string('p', 200),
            rows: [Row(model: new string('m', 100))]));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Theory]
    [InlineData("nobody")]
    [InlineData("jenny")] // inactive
    public async Task Ingest_UnknownOrInactiveUser_Returns400(string userId)
    {
        var response = await PostAsync(Payload(userId: userId));

        await AssertBadRequestAsync(response, "userId");
    }

    [Fact]
    public async Task Ingest_DateIsTodayInTaipei_IsAccepted()
    {
        // Clock is 2026-10-20 17:00 UTC = 2026-10-21 01:00 in Taipei.
        var response = await PostAsync(Payload(rows: [Row(date: "2026-10-21")]));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task Ingest_DateAfterTodayInTaipei_Returns400()
    {
        var response = await PostAsync(Payload(rows: [Row(date: "2026-10-22")]));

        await AssertBadRequestAsync(response, "date");
    }

    [Fact]
    public async Task Ingest_DuplicateDateAndModel_Returns400()
    {
        var response = await PostAsync(Payload(rows:
            [Row("2026-10-20", "claude-opus-5-5"), Row("2026-10-19", "claude-opus-5-5"), Row("2026-10-20", "claude-opus-5-5")]));

        await AssertBadRequestAsync(response, "rows");
    }

    [Theory]
    [InlineData("claude-opus-5-5 ")] // SQL Server ignores trailing spaces in key comparison
    [InlineData("CLAUDE-OPUS-5-5")]  // and the default collation is case-insensitive
    public async Task Ingest_ModelsEqualToSqlServer_AreDuplicates(string sameModel)
    {
        var response = await PostAsync(Payload(rows: [Row(model: "claude-opus-5-5"), Row(model: sameModel)]));

        await AssertBadRequestAsync(response, "rows");
    }

    [Fact]
    public async Task Ingest_TrimsTextFields()
    {
        var response = await PostAsync(Payload(sessionId: " s-1 ", userId: " helen ", project: " netprof/cms ",
            rows: [Row(model: " claude-opus-5-5 ")]));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var row = Assert.Single(_repository.Rows);
        Assert.Equal(("s-1", "helen", "netprof/cms", "claude-opus-5-5"), (row.SessionId, row.UserId, row.Project, row.Model));
    }

    private async Task AssertBadRequestAsync(HttpResponseMessage response, string field)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        Assert.Contains(problem!.Errors.Keys, k => k.Contains(field, StringComparison.OrdinalIgnoreCase));
        Assert.All(problem.Errors.Values, messages => Assert.NotEmpty(messages));
        Assert.Empty(_repository.Rows);
    }
}
