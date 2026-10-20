using System.Net;
using System.Net.Http.Json;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

/// <summary>
/// Cost of ingested usage, and recompute when model prices change.
/// Fake prices (USD per million): claude-opus-5-5 from 2026-01-01 = 4 / 5 / 8 / 0.2 / 20,
/// from 2026-06-01 = 3 / 3.75 / 6 / 0.15 / 15; claude-haiku-5-5 from 2026-01-01.
/// </summary>
public class TokenUsagePricingApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeTokenUsageRepository _usages = new();

    public TokenUsagePricingApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<ITokenUsageRepository>();
            services.AddSingleton<ITokenUsageRepository>(_usages);
            services.RemoveAll<IAppUserRepository>();
            services.AddSingleton<IAppUserRepository>(new FakeAppUserRepository());
            services.RemoveAll<IIngestApiKeyReader>();
            services.AddSingleton<IIngestApiKeyReader>(new FakeIngestApiKeyReader());
            services.RemoveAll<IModelPriceRepository>();
            services.AddSingleton<IModelPriceRepository>(new FakeModelPriceRepository());
        }));
    }

    /// <summary>1M / 2M / 3M / 4M / 5M tokens, so each price contributes a distinct amount.</summary>
    private static object Row(string date, string model = "claude-opus-5-5") => new
    {
        date, model,
        inputTokens = 1_000_000L, cacheWrite5mTokens = 2_000_000L, cacheWrite1hTokens = 3_000_000L,
        cacheReadTokens = 4_000_000L, outputTokens = 5_000_000L,
    };

    // Worked by hand from the fake prices and Row()'s token counts.
    private const decimal JanuaryOpusCost = 138.8m; // 4 + 2*5 + 3*8 + 4*0.2 + 5*20
    private const decimal JuneOpusCost = 104.1m;    // 3 + 2*3.75 + 3*6 + 4*0.15 + 5*15

    private async Task IngestAsync(string sessionId, params object[] rows)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/tokenusages")
        {
            Content = JsonContent.Create(new { sessionId, userId = "helen", project = "netprof/cms", rows }),
        };
        request.Headers.Add("X-Api-Key", FakeIngestApiKeyReader.ApiKey);
        var response = await _factory.CreateClient().SendAsync(request);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    private decimal? CostOf(string date, string model = "claude-opus-5-5") =>
        _usages.Rows.Single(r => r.UsageDate == DateOnly.Parse(date) && r.Model == model).Cost;

    // ---- ingest ----

    [Fact]
    public async Task Ingest_UsesLatestPriceEffectiveOnOrBeforeUsageDate()
    {
        await IngestAsync("s-1", Row("2026-05-31"), Row("2026-06-01"), Row("2026-10-20"));

        Assert.Equal(JanuaryOpusCost, CostOf("2026-05-31"));
        Assert.Equal(JuneOpusCost, CostOf("2026-06-01"));
        Assert.Equal(JuneOpusCost, CostOf("2026-10-20"));
    }

    [Fact]
    public async Task Ingest_NoApplicablePrice_StoresRowWithNullCost()
    {
        await IngestAsync("s-1", Row("2025-12-31"), Row("2026-10-20", "claude-unpriced"));

        Assert.Null(CostOf("2025-12-31"));
        Assert.Null(CostOf("2026-10-20", "claude-unpriced"));
    }

    [Fact]
    public async Task Ingest_CostIsRoundedToSixDecimals()
    {
        // 1 cache-read token at 0.01 USD per million (haiku) = 0.00000001, below decimal(18,6).
        // 7 input tokens at 0.1 per million = 0.0000007 -> 0.000001.
        var tiny = new
        {
            date = "2026-10-20", model = "claude-haiku-5-5",
            inputTokens = 7L, cacheWrite5mTokens = 0L, cacheWrite1hTokens = 0L, cacheReadTokens = 1L, outputTokens = 0L,
        };

        await IngestAsync("s-1", tiny);

        Assert.Equal(0.000001m, CostOf("2026-10-20", "claude-haiku-5-5"));
    }

    // ---- recompute on price changes ----

    private static object Price(string model, string effectiveDate, decimal each) => new
    {
        model, effectiveDate,
        inputPrice = each, cacheWrite5mPrice = each, cacheWrite1hPrice = each, cacheReadPrice = each, outputPrice = each,
    };

    /// <summary>Row() has 15M tokens in total, so a flat price P per million costs 15 * P.</summary>
    private const decimal TokensInMillions = 15m;

    [Fact]
    public async Task CreatePrice_RecomputesThatModelsRowsFromItsEffectiveDate()
    {
        await IngestAsync("s-1", Row("2026-05-31"), Row("2026-09-30"), Row("2026-10-01"), Row("2026-10-20", "claude-haiku-5-5"));
        await IngestAsync("s-2", Row("2026-10-02"));
        var haikuBefore = CostOf("2026-10-20", "claude-haiku-5-5");

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/modelprices", Price("claude-opus-5-5", "2026-10-01", 1m));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(JanuaryOpusCost, CostOf("2026-05-31"));
        Assert.Equal(JuneOpusCost, CostOf("2026-09-30"));
        Assert.Equal(TokensInMillions, CostOf("2026-10-01"));
        Assert.Equal(TokensInMillions, CostOf("2026-10-02"));
        Assert.Equal(haikuBefore, CostOf("2026-10-20", "claude-haiku-5-5"));
    }

    [Fact]
    public async Task CreatePrice_ForUnpricedModel_FillsNullCosts()
    {
        await IngestAsync("s-1", Row("2026-10-20", "claude-new"));

        await _factory.CreateClient().PostAsJsonAsync("/api/modelprices", Price("claude-new", "2026-10-01", 2m));

        Assert.Equal(2m * TokensInMillions, CostOf("2026-10-20", "claude-new"));
    }

    [Fact]
    public async Task UpdatePrice_RecomputesRowsUsingIt()
    {
        await IngestAsync("s-1", Row("2026-05-31"), Row("2026-06-01"));

        var response = await _factory.CreateClient().PutAsJsonAsync("/api/modelprices", Price("claude-opus-5-5", "2026-06-01", 2m));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(JanuaryOpusCost, CostOf("2026-05-31"));
        Assert.Equal(2m * TokensInMillions, CostOf("2026-06-01"));
    }

    [Fact]
    public async Task DeletePrice_FallsBackToEarlierPrice()
    {
        await IngestAsync("s-1", Row("2026-06-01"));

        var response = await _factory.CreateClient().DeleteAsync("/api/modelprices/claude-opus-5-5/2026-06-01");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(JanuaryOpusCost, CostOf("2026-06-01"));
    }

    [Fact]
    public async Task DeleteLastPrice_SetsCostToNull()
    {
        await IngestAsync("s-1", Row("2026-10-20", "claude-haiku-5-5"));

        var response = await _factory.CreateClient().DeleteAsync("/api/modelprices/claude-haiku-5-5/2026-01-01");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Null(CostOf("2026-10-20", "claude-haiku-5-5"));
    }
}
