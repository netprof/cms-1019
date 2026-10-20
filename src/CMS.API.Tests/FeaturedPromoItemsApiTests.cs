using System.Net;
using System.Net.Http.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

public class FeaturedPromoItemsApiTests : IClassFixture<ApiTestFactory>
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeFeaturedPromoItemRepository _repository = new();

    public FeaturedPromoItemsApiTests(ApiTestFactory factory)
    {
        // Each test class instance gets its own fake repository (fresh data).
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IFeaturedPromoItemRepository>();
            services.AddSingleton<IFeaturedPromoItemRepository>(_repository);
        }));
    }

    private static FeaturedPromoItemRequest NewRequest(int pkid = 0) => new()
    {
        Pkid = pkid,
        ScheduleOn = new DateOnly(2026, 3, 17),
        TrainingCenterPkid = 1,
        Slot = 1,
        PromotionPkid = 11,
        Topic = "Google AI工具一次掌握",
        Description = "不需技術基礎！最新Google AI實戰課程",
    };

    private static async Task<List<FeaturedPromoItem>> QueryAsync(HttpClient client, FeaturedPromoItemQuery query)
    {
        var response = await client.PostAsJsonAsync("/api/featuredpromoitems/query", query);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<List<FeaturedPromoItem>>())!;
    }

    // ---- list / filter ----

    [Fact]
    public async Task GetAll_ReturnsItemsOrderedByDateCenterSlotWithPromoCode()
    {
        var items = await _factory.CreateAuthenticatedClient().GetFromJsonAsync<List<FeaturedPromoItem>>("/api/featuredpromoitems");

        Assert.Equal([1, 3, 2, 6, 4, 5], items!.Select(f => f.Pkid));
        Assert.Equal("20251204_SkillTrainAI", items[1].Promotion.PromoCode);
        Assert.Equal("251211_GoogleAI", items[2].Promotion.PromoCode);
    }

    [Theory]
    [InlineData(2026, 3, 16)] // Monday
    [InlineData(2026, 3, 18)] // Wednesday
    [InlineData(2026, 3, 22)] // Sunday
    public async Task Query_WeekOf_ReturnsMondayToSundayOnly(int y, int m, int d)
    {
        var items = await QueryAsync(_factory.CreateAuthenticatedClient(), new FeaturedPromoItemQuery { WeekOf = new DateOnly(y, m, d) });

        // Excludes Sun 3/15 (item 1) and Mon 3/23 (item 5).
        Assert.Equal([3, 2, 6, 4], items.Select(f => f.Pkid));
        Assert.Equal(new DateOnly(2026, 3, 16), _repository.LastQuery!.ScheduleOnFrom);
        Assert.Equal(new DateOnly(2026, 3, 22), _repository.LastQuery.ScheduleOnTo);
    }

    [Fact]
    public async Task Query_WeekOf_OverridesExplicitRange()
    {
        var items = await QueryAsync(_factory.CreateAuthenticatedClient(), new FeaturedPromoItemQuery
        {
            WeekOf = new DateOnly(2026, 3, 23),
            ScheduleOnFrom = new DateOnly(2026, 1, 1),
            ScheduleOnTo = new DateOnly(2026, 12, 31),
        });

        Assert.Equal([5], items.Select(f => f.Pkid));
    }

    [Fact]
    public async Task Query_ByTrainingCenter_Filters()
    {
        var items = await QueryAsync(_factory.CreateAuthenticatedClient(), new FeaturedPromoItemQuery { TrainingCenterPkid = 2 });

        Assert.Equal([6], items.Select(f => f.Pkid));
    }

    [Fact]
    public async Task Query_ByTrainingCenterAndWeek_Combines()
    {
        var items = await QueryAsync(_factory.CreateAuthenticatedClient(), new FeaturedPromoItemQuery
        {
            TrainingCenterPkid = 1,
            WeekOf = new DateOnly(2026, 3, 19),
        });

        Assert.Equal([3, 2, 4], items.Select(f => f.Pkid));
        Assert.All(items, f => Assert.Equal(1, f.TrainingCenterPkid));
    }

    [Fact]
    public async Task Query_ByScheduleOnRange_IsInclusive()
    {
        var items = await QueryAsync(_factory.CreateAuthenticatedClient(), new FeaturedPromoItemQuery
        {
            ScheduleOnFrom = new DateOnly(2026, 3, 15),
            ScheduleOnTo = new DateOnly(2026, 3, 16),
        });

        Assert.Equal([1, 3, 2], items.Select(f => f.Pkid));
    }

    [Fact]
    public async Task Query_RangeReversed_Returns400()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/featuredpromoitems/query", new FeaturedPromoItemQuery
        {
            ScheduleOnFrom = new DateOnly(2026, 3, 22),
            ScheduleOnTo = new DateOnly(2026, 3, 16),
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Query_EmptyFilter_ReturnsAll()
    {
        var items = await QueryAsync(_factory.CreateAuthenticatedClient(), new FeaturedPromoItemQuery());

        Assert.Equal(6, items.Count);
    }

    // ---- view ----

    [Fact]
    public async Task GetById_Existing_ReturnsItemWithPromotion()
    {
        var item = await _factory.CreateAuthenticatedClient().GetFromJsonAsync<FeaturedPromoItem>("/api/featuredpromoitems/2");

        Assert.Equal(new DateOnly(2026, 3, 16), item!.ScheduleOn);
        Assert.Equal(2, item.Slot);
        Assert.Equal(11, item.PromotionPkid);
        Assert.Equal("251211_GoogleAI", item.Promotion.PromoCode);
        Assert.Equal("Topic 2", item.Topic);
    }

    [Fact]
    public async Task GetById_Missing_Returns404()
    {
        var response = await _factory.CreateAuthenticatedClient().GetAsync("/api/featuredpromoitems/99");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- add ----

    [Fact]
    public async Task Create_ValidRequest_Returns201()
    {
        var client = _factory.CreateAuthenticatedClient();

        var response = await client.PostAsJsonAsync("/api/featuredpromoitems", NewRequest());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<FeaturedPromoItem>();
        Assert.Equal(7, created!.Pkid);
        Assert.EndsWith("/api/featuredpromoitems/7", response.Headers.Location!.ToString());
        var fetched = await client.GetFromJsonAsync<FeaturedPromoItem>("/api/featuredpromoitems/7");
        Assert.Equal("251211_GoogleAI", fetched!.Promotion.PromoCode);
        Assert.Equal(new DateOnly(2026, 3, 17), fetched.ScheduleOn);
    }

    [Fact]
    public async Task Create_TrimsText()
    {
        var request = NewRequest();
        request.Topic = "  AI  ";
        request.Description = " 說明 ";

        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/featuredpromoitems", request);

        response.EnsureSuccessStatusCode();
        var created = await response.Content.ReadFromJsonAsync<FeaturedPromoItem>();
        Assert.Equal("AI", created!.Topic);
        Assert.Equal("說明", created.Description);
    }

    [Fact]
    public async Task Create_SlotAlreadyTaken_Returns409()
    {
        var request = NewRequest();
        request.ScheduleOn = new DateOnly(2026, 3, 16);
        request.Slot = 2;

        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/featuredpromoitems", request);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Create_SameSlotOtherCenter_IsAllowed()
    {
        var request = NewRequest();
        request.ScheduleOn = new DateOnly(2026, 3, 16);
        request.Slot = 2;
        request.TrainingCenterPkid = 2;

        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/featuredpromoitems", request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(4)]
    public async Task Create_SlotOutOfRange_Returns400(byte slot)
    {
        var request = NewRequest();
        request.Slot = slot;

        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/featuredpromoitems", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_MissingPromotion_Returns400()
    {
        var request = NewRequest();
        request.PromotionPkid = 0;

        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/featuredpromoitems", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_MissingTrainingCenter_Returns400()
    {
        var request = NewRequest();
        request.TrainingCenterPkid = 0;

        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/featuredpromoitems", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_BlankTopic_Returns400()
    {
        var request = NewRequest();
        request.Topic = "   ";

        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/featuredpromoitems", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_DescriptionTooLong_Returns400()
    {
        var request = NewRequest();
        request.Description = new string('x', 301);

        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/featuredpromoitems", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- edit ----

    [Fact]
    public async Task Update_Existing_ChangesPromotionAndText()
    {
        var client = _factory.CreateAuthenticatedClient();
        var request = NewRequest(2);
        request.ScheduleOn = new DateOnly(2026, 3, 16);
        request.Slot = 2;
        request.PromotionPkid = 12;
        request.Topic = "n8n自動化三部曲";

        var response = await client.PutAsJsonAsync("/api/featuredpromoitems", request);

        response.EnsureSuccessStatusCode();
        var updated = await client.GetFromJsonAsync<FeaturedPromoItem>("/api/featuredpromoitems/2");
        Assert.Equal("20251215_n8n", updated!.Promotion.PromoCode);
        Assert.Equal("n8n自動化三部曲", updated.Topic);
    }

    [Fact]
    public async Task Update_IntoAnotherItemsSlot_Returns409()
    {
        var request = NewRequest(2);
        request.ScheduleOn = new DateOnly(2026, 3, 16);
        request.Slot = 1; // held by item 3

        var response = await _factory.CreateAuthenticatedClient().PutAsJsonAsync("/api/featuredpromoitems", request);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Update_Missing_Returns404()
    {
        var response = await _factory.CreateAuthenticatedClient().PutAsJsonAsync("/api/featuredpromoitems", NewRequest(99));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- move slot ----

    [Fact]
    public async Task MoveDown_SwapsWithNextSlot()
    {
        var client = _factory.CreateAuthenticatedClient();

        var response = await client.PostAsync("/api/featuredpromoitems/3/move-down", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(2, (await client.GetFromJsonAsync<FeaturedPromoItem>("/api/featuredpromoitems/3"))!.Slot);
        Assert.Equal(1, (await client.GetFromJsonAsync<FeaturedPromoItem>("/api/featuredpromoitems/2"))!.Slot);
    }

    [Fact]
    public async Task MoveUp_SwapsWithPreviousSlot()
    {
        var client = _factory.CreateAuthenticatedClient();

        var response = await client.PostAsync("/api/featuredpromoitems/2/move-up", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(1, (await client.GetFromJsonAsync<FeaturedPromoItem>("/api/featuredpromoitems/2"))!.Slot);
        Assert.Equal(2, (await client.GetFromJsonAsync<FeaturedPromoItem>("/api/featuredpromoitems/3"))!.Slot);
    }

    [Fact]
    public async Task MoveDown_IntoEmptySlot_JustMoves()
    {
        var client = _factory.CreateAuthenticatedClient();

        var response = await client.PostAsync("/api/featuredpromoitems/6/move-down", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(2, (await client.GetFromJsonAsync<FeaturedPromoItem>("/api/featuredpromoitems/6"))!.Slot);
    }

    [Fact]
    public async Task MoveUp_FromFirstSlot_Returns400()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsync("/api/featuredpromoitems/3/move-up", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task MoveDown_FromLastSlot_Returns400()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsync("/api/featuredpromoitems/4/move-down", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Move_Missing_Returns404()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsync("/api/featuredpromoitems/99/move-down", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- delete ----

    [Fact]
    public async Task Delete_Existing_Returns204ThenGone()
    {
        var client = _factory.CreateAuthenticatedClient();

        var response = await client.DeleteAsync("/api/featuredpromoitems/4");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/featuredpromoitems/4")).StatusCode);
    }

    [Fact]
    public async Task Delete_Missing_Returns404()
    {
        var response = await _factory.CreateAuthenticatedClient().DeleteAsync("/api/featuredpromoitems/99");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- lookups ----

    [Fact]
    public async Task Lookups_Promotions_FiltersByPromoCodeContains()
    {
        var lookups = await _factory.CreateAuthenticatedClient()
            .GetFromJsonAsync<List<PromotionLookup>>("/api/lookups/promotions?keyword=googleai");

        var promo = Assert.Single(lookups!);
        Assert.Equal(11, promo.Pkid);
        Assert.Equal("251211_GoogleAI", promo.PromoCode);
        Assert.Equal("Google AI工具一次掌握", promo.Topic);
        Assert.Equal("不需技術基礎", promo.Description);
    }

    [Fact]
    public async Task Lookups_Promotions_PartialCodeMatchesSeveralNewestFirst()
    {
        var lookups = await _factory.CreateAuthenticatedClient()
            .GetFromJsonAsync<List<PromotionLookup>>("/api/lookups/promotions?keyword=2025120");

        Assert.Equal([10], lookups!.Select(p => p.Pkid));

        lookups = await _factory.CreateAuthenticatedClient()
            .GetFromJsonAsync<List<PromotionLookup>>("/api/lookups/promotions?keyword=2512");

        Assert.Equal([12, 11, 10], lookups!.Select(p => p.Pkid));
    }

    [Fact]
    public async Task Lookups_Promotions_NoKeyword_ReturnsNewestFirst()
    {
        var lookups = await _factory.CreateAuthenticatedClient()
            .GetFromJsonAsync<List<PromotionLookup>>("/api/lookups/promotions");

        Assert.Equal([12, 11, 10], lookups!.Select(p => p.Pkid));
    }

    [Fact]
    public async Task Lookups_Promotions_NoMatch_ReturnsEmpty()
    {
        var lookups = await _factory.CreateAuthenticatedClient()
            .GetFromJsonAsync<List<PromotionLookup>>("/api/lookups/promotions?keyword=nothing");

        Assert.Empty(lookups!);
    }

    [Fact]
    public async Task Lookups_TrainingCenters_ReturnsSlimList()
    {
        var lookups = await _factory.CreateAuthenticatedClient()
            .GetFromJsonAsync<List<TrainingCenterLookup>>("/api/lookups/trainingcenters");

        Assert.Equal(["新竹", "台北"], lookups!.Select(t => t.Name));
    }
}
