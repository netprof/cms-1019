using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IModelPriceRepository
{
    /// <summary>All prices, ordered by Model then EffectiveDate descending.</summary>
    Task<IEnumerable<ModelPrice>> GetAllAsync();
    Task<IEnumerable<ModelPrice>> QueryAsync(ModelPriceQuery query);
    Task<ModelPrice?> GetByIdAsync(string model, DateOnly effectiveDate);
    Task<bool> ExistsAsync(string model, DateOnly effectiveDate);
    Task<ModelPrice> CreateAsync(ModelPriceRequest request);

    /// <returns>The updated record, or null if the key does not exist.</returns>
    Task<ModelPrice?> UpdateAsync(ModelPriceRequest request);

    /// <returns>False if the key does not exist.</returns>
    Task<bool> DeleteAsync(string model, DateOnly effectiveDate);
}
