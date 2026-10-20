using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Tests;

public class FakeFeaturedPromoItemRepository : IFeaturedPromoItemRepository
{
    private readonly List<PromotionLookup> _promotions =
    [
        new() { Pkid = 10, PromoCode = "20251204_SkillTrainAI", Topic = "成為能AI協作的程式設計師", Description = "轉職就業養成班" },
        new() { Pkid = 11, PromoCode = "251211_GoogleAI", Topic = "Google AI工具一次掌握", Description = "不需技術基礎" },
        new() { Pkid = 12, PromoCode = "20251215_n8n", Topic = "n8n自動化三部曲", Description = "從自動化新手到企業級AI架構師" },
    ];

    private readonly List<TrainingCenterLookup> _trainingCenters =
    [
        new() { Pkid = 2, Name = "新竹" },
        new() { Pkid = 1, Name = "台北" },
    ];

    // Week under test: Mon 2026-03-16 .. Sun 2026-03-22. Items 1 and 5 sit just outside it.
    private readonly List<FeaturedPromoItem> _items;

    public FakeFeaturedPromoItemRepository()
    {
        _items =
        [
            Item(1, new DateOnly(2026, 3, 15), 1, 1, 10),
            Item(2, new DateOnly(2026, 3, 16), 1, 2, 11),
            Item(3, new DateOnly(2026, 3, 16), 1, 1, 10),
            Item(4, new DateOnly(2026, 3, 22), 1, 3, 12),
            Item(5, new DateOnly(2026, 3, 23), 1, 1, 10),
            Item(6, new DateOnly(2026, 3, 18), 2, 1, 12),
        ];
    }

    private FeaturedPromoItem Item(int pkid, DateOnly on, short center, byte slot, int promotion) => new()
    {
        Pkid = pkid, ScheduleOn = on, TrainingCenterPkid = center, Slot = slot, PromotionPkid = promotion,
        Topic = $"Topic {pkid}", Description = $"Description {pkid}",
        Promotion = _promotions.First(p => p.Pkid == promotion),
    };

    private static FeaturedPromoItem Clone(FeaturedPromoItem f) => new()
    {
        Pkid = f.Pkid, ScheduleOn = f.ScheduleOn, TrainingCenterPkid = f.TrainingCenterPkid, Slot = f.Slot,
        PromotionPkid = f.PromotionPkid, Topic = f.Topic, Description = f.Description, Promotion = f.Promotion,
    };

    private static IEnumerable<FeaturedPromoItem> Ordered(IEnumerable<FeaturedPromoItem> source) =>
        source.OrderBy(f => f.ScheduleOn).ThenBy(f => f.TrainingCenterPkid).ThenBy(f => f.Slot);

    /// <summary>The query last passed to <see cref="QueryAsync"/>, after controller processing.</summary>
    public FeaturedPromoItemQuery? LastQuery { get; private set; }

    public Task<IEnumerable<FeaturedPromoItem>> GetAllAsync() =>
        Task.FromResult(Ordered(_items).Select(Clone).ToList().AsEnumerable());

    public Task<IEnumerable<FeaturedPromoItem>> QueryAsync(FeaturedPromoItemQuery q)
    {
        LastQuery = q;
        var result = _items.AsEnumerable();
        if (q.TrainingCenterPkid.HasValue) result = result.Where(f => f.TrainingCenterPkid == q.TrainingCenterPkid);
        if (q.ScheduleOnFrom.HasValue) result = result.Where(f => f.ScheduleOn >= q.ScheduleOnFrom);
        if (q.ScheduleOnTo.HasValue) result = result.Where(f => f.ScheduleOn <= q.ScheduleOnTo);
        return Task.FromResult(Ordered(result).Select(Clone).ToList().AsEnumerable());
    }

    public Task<FeaturedPromoItem?> GetByIdAsync(int pkid) =>
        Task.FromResult(_items.Where(f => f.Pkid == pkid).Select(Clone).FirstOrDefault());

    public Task<FeaturedPromoItem> CreateAsync(FeaturedPromoItemRequest request)
    {
        var item = new FeaturedPromoItem { Pkid = _items.Count == 0 ? 1 : _items.Max(f => f.Pkid) + 1 };
        Apply(item, request);
        _items.Add(item);
        return Task.FromResult(Clone(item));
    }

    public Task<FeaturedPromoItem?> UpdateAsync(FeaturedPromoItemRequest request)
    {
        var item = _items.FirstOrDefault(f => f.Pkid == request.Pkid);
        if (item is null) return Task.FromResult<FeaturedPromoItem?>(null);
        Apply(item, request);
        return Task.FromResult<FeaturedPromoItem?>(Clone(item));
    }

    public Task<bool> DeleteAsync(int pkid) => Task.FromResult(_items.RemoveAll(f => f.Pkid == pkid) > 0);

    public Task<bool> IsSlotTakenAsync(DateOnly scheduleOn, short trainingCenterPkid, byte slot, int excludePkid) =>
        Task.FromResult(_items.Any(f =>
            f.ScheduleOn == scheduleOn && f.TrainingCenterPkid == trainingCenterPkid && f.Slot == slot && f.Pkid != excludePkid));

    public Task MoveAsync(FeaturedPromoItem item, byte toSlot)
    {
        var sameDay = _items.Where(f => f.ScheduleOn == item.ScheduleOn && f.TrainingCenterPkid == item.TrainingCenterPkid).ToList();
        var occupant = sameDay.FirstOrDefault(f => f.Slot == toSlot);
        if (occupant is not null) occupant.Slot = item.Slot;
        sameDay.First(f => f.Pkid == item.Pkid).Slot = toSlot;
        return Task.CompletedTask;
    }

    public Task<IEnumerable<TrainingCenterLookup>> GetTrainingCenterLookupsAsync() =>
        Task.FromResult(_trainingCenters.AsEnumerable());

    public Task<IEnumerable<PromotionLookup>> SearchPromotionLookupsAsync(string? keyword, int limit) =>
        Task.FromResult(_promotions
            .Where(p => string.IsNullOrWhiteSpace(keyword) || p.PromoCode.Contains(keyword.Trim(), StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(p => p.Pkid)
            .Take(limit)
            .ToList()
            .AsEnumerable());

    private void Apply(FeaturedPromoItem item, FeaturedPromoItemRequest r)
    {
        item.ScheduleOn = r.ScheduleOn; item.TrainingCenterPkid = r.TrainingCenterPkid; item.Slot = r.Slot;
        item.PromotionPkid = r.PromotionPkid; item.Topic = r.Topic; item.Description = r.Description;
        item.Promotion = _promotions.FirstOrDefault(p => p.Pkid == r.PromotionPkid) ?? new() { Pkid = r.PromotionPkid };
    }
}
