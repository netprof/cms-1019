using System.Net;
using System.Net.Http.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

public class ModelPricesApiTests : IClassFixture<ApiTestFactory>
{
    private readonly WebApplicationFactory<Program> _factory;

    public ModelPricesApiTests(ApiTestFactory factory)
    {
        // Each test class instance gets its own fake repository (fresh data).
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IModelPriceRepository>();
            services.AddSingleton<IModelPriceRepository>(new FakeModelPriceRepository());
            services.RemoveAll<ITokenUsageRepository>(); // price changes recompute usage costs
            services.AddSingleton<ITokenUsageRepository>(new FakeTokenUsageRepository());
        }));
    }

    private static ModelPriceRequest NewRequest(string model = "claude-sonnet-5-5", string date = "2026-01-01") => new()
    {
        Model = model,
        EffectiveDate = DateOnly.Parse(date),
        InputPrice = 2m,
        CacheWrite5mPrice = 2.5m,
        CacheWrite1hPrice = 4m,
        CacheReadPrice = 0.1m,
        OutputPrice = 10m,
    };

    private static string Keys(IEnumerable<ModelPrice> prices) =>
        string.Join(",", prices.Select(p => $"{p.Model}@{p.EffectiveDate:yyyy-MM-dd}"));

    // ---- list / filter ----

    [Fact]
    public async Task GetAll_ReturnsPricesByModelThenNewestDateFirst()
    {
        var prices = await _factory.CreateAuthenticatedClient().GetFromJsonAsync<List<ModelPrice>>("/api/modelprices");

        Assert.Equal(
            "claude-haiku-5-5@2026-01-01,claude-opus-5-5@2026-06-01,claude-opus-5-5@2026-01-01",
            Keys(prices!));
    }

    [Fact]
    public async Task Query_ByKeyword_FiltersOnModel()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/modelprices/query",
            new ModelPriceQuery { Keyword = "haiku" });

        response.EnsureSuccessStatusCode();
        var prices = await response.Content.ReadFromJsonAsync<List<ModelPrice>>();
        Assert.Equal("claude-haiku-5-5@2026-01-01", Keys(prices!));
    }

    [Fact]
    public async Task Query_ByEffectiveDateRange_IsInclusive()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/modelprices/query",
            new ModelPriceQuery { EffectiveDateFrom = new DateOnly(2026, 6, 1), EffectiveDateTo = new DateOnly(2026, 6, 1) });

        var prices = await response.Content.ReadFromJsonAsync<List<ModelPrice>>();
        Assert.Equal("claude-opus-5-5@2026-06-01", Keys(prices!));
    }

    [Fact]
    public async Task Query_EmptyFilter_ReturnsAll()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/modelprices/query", new ModelPriceQuery());

        var prices = await response.Content.ReadFromJsonAsync<List<ModelPrice>>();
        Assert.Equal(3, prices!.Count);
    }

    // ---- view ----

    [Fact]
    public async Task GetById_Existing_ReturnsAllFivePrices()
    {
        var price = await _factory.CreateAuthenticatedClient()
            .GetFromJsonAsync<ModelPrice>("/api/modelprices/claude-haiku-5-5/2026-01-01");

        Assert.Equal("claude-haiku-5-5", price!.Model);
        Assert.Equal(new DateOnly(2026, 1, 1), price.EffectiveDate);
        Assert.Equal(0.1m, price.InputPrice);
        Assert.Equal(0.125m, price.CacheWrite5mPrice);
        Assert.Equal(0.2m, price.CacheWrite1hPrice);
        Assert.Equal(0.01m, price.CacheReadPrice);
        Assert.Equal(0.5m, price.OutputPrice);
    }

    [Fact]
    public async Task GetById_SameModelOtherDate_Returns404()
    {
        var response = await _factory.CreateAuthenticatedClient().GetAsync("/api/modelprices/claude-haiku-5-5/2026-06-01");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetById_InvalidDate_IsRejected()
    {
        var response = await _factory.CreateAuthenticatedClient().GetAsync("/api/modelprices/claude-haiku-5-5/not-a-date");

        Assert.False(response.IsSuccessStatusCode);
    }

    // ---- add ----

    [Fact]
    public async Task Create_ValidRequest_Returns201AndPersists()
    {
        var client = _factory.CreateAuthenticatedClient();

        var response = await client.PostAsJsonAsync("/api/modelprices", NewRequest());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.EndsWith("/api/modelprices/claude-sonnet-5-5/2026-01-01", response.Headers.Location!.ToString());
        var fetched = await client.GetFromJsonAsync<ModelPrice>("/api/modelprices/claude-sonnet-5-5/2026-01-01");
        Assert.Equal(0.1m, fetched!.CacheReadPrice);
        Assert.Equal(10m, fetched.OutputPrice);
    }

    [Fact]
    public async Task Create_TrimsModel()
    {
        var client = _factory.CreateAuthenticatedClient();

        var response = await client.PostAsJsonAsync("/api/modelprices", NewRequest("  claude-sonnet-5-5 "));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/modelprices/claude-sonnet-5-5/2026-01-01")).StatusCode);
    }

    [Fact]
    public async Task Create_NewDateForExistingModel_Returns201()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/modelprices",
            NewRequest("claude-opus-5-5", "2026-10-01"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task Create_DuplicateModelAndDate_Returns409()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/modelprices",
            NewRequest("claude-opus-5-5", "2026-06-01"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Create_BlankModel_Returns400()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/modelprices", NewRequest(""));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_ModelTooLong_Returns400()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/modelprices", NewRequest(new string('m', 101)));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_NegativePrice_Returns400()
    {
        var request = NewRequest();
        request.CacheWrite1hPrice = -1m;

        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/modelprices", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- edit ----

    [Fact]
    public async Task Update_Existing_ChangesPrices()
    {
        var client = _factory.CreateAuthenticatedClient();
        var request = NewRequest("claude-opus-5-5", "2026-01-01");
        request.InputPrice = 4.5m;
        request.CacheReadPrice = 0.25m;

        var response = await client.PutAsJsonAsync("/api/modelprices", request);

        response.EnsureSuccessStatusCode();
        var updated = await client.GetFromJsonAsync<ModelPrice>("/api/modelprices/claude-opus-5-5/2026-01-01");
        Assert.Equal(4.5m, updated!.InputPrice);
        Assert.Equal(0.25m, updated.CacheReadPrice);
        var other = await client.GetFromJsonAsync<ModelPrice>("/api/modelprices/claude-opus-5-5/2026-06-01");
        Assert.Equal(3m, other!.InputPrice);
    }

    [Fact]
    public async Task Update_Missing_Returns404()
    {
        var response = await _factory.CreateAuthenticatedClient().PutAsJsonAsync("/api/modelprices",
            NewRequest("claude-opus-5-5", "2025-01-01"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Update_NegativePrice_Returns400()
    {
        var request = NewRequest("claude-opus-5-5", "2026-01-01");
        request.OutputPrice = -0.01m;

        var response = await _factory.CreateAuthenticatedClient().PutAsJsonAsync("/api/modelprices", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- delete ----

    [Fact]
    public async Task Delete_Existing_Returns204ThenGoneAndOtherDateKept()
    {
        var client = _factory.CreateAuthenticatedClient();

        var response = await client.DeleteAsync("/api/modelprices/claude-opus-5-5/2026-06-01");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/modelprices/claude-opus-5-5/2026-06-01")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/modelprices/claude-opus-5-5/2026-01-01")).StatusCode);
    }

    [Fact]
    public async Task Delete_Missing_Returns404()
    {
        var response = await _factory.CreateAuthenticatedClient().DeleteAsync("/api/modelprices/claude-opus-5-5/2020-01-01");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
