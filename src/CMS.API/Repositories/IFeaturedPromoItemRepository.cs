using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IFeaturedPromoItemRepository
{
    Task<IEnumerable<FeaturedPromoItem>> GetAllAsync();
    Task<IEnumerable<FeaturedPromoItem>> QueryAsync(FeaturedPromoItemQuery query);
    Task<FeaturedPromoItem?> GetByIdAsync(int pkid);
    Task<FeaturedPromoItem> CreateAsync(FeaturedPromoItemRequest request);

    /// <returns>The updated record, or null if the item does not exist.</returns>
    Task<FeaturedPromoItem?> UpdateAsync(FeaturedPromoItemRequest request);

    /// <returns>False if the item does not exist.</returns>
    Task<bool> DeleteAsync(int pkid);

    /// <summary>True if another item (not <paramref name="excludePkid"/>) holds the day/center/slot.</summary>
    Task<bool> IsSlotTakenAsync(DateOnly scheduleOn, short trainingCenterPkid, byte slot, int excludePkid);

    /// <summary>
    /// Moves the item to <paramref name="toSlot"/> on the same day and center, swapping with the
    /// item already there (if any).
    /// </summary>
    Task MoveAsync(FeaturedPromoItem item, byte toSlot);

    Task<IEnumerable<TrainingCenterLookup>> GetTrainingCenterLookupsAsync();

    /// <summary>Promotions whose PromoCode contains <paramref name="keyword"/>, newest first, at most <paramref name="limit"/>.</summary>
    Task<IEnumerable<PromotionLookup>> SearchPromotionLookupsAsync(string? keyword, int limit);
}
