using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Tests;

public class FakeModelPriceRepository : IModelPriceRepository
{
    private readonly List<ModelPrice> _prices =
    [
        new() { Model = "claude-opus-5-5", EffectiveDate = new DateOnly(2026, 1, 1),
            InputPrice = 4m, CacheWrite5mPrice = 5m, CacheWrite1hPrice = 8m, CacheReadPrice = 0.2m, OutputPrice = 20m },
        new() { Model = "claude-haiku-5-5", EffectiveDate = new DateOnly(2026, 1, 1),
            InputPrice = 0.1m, CacheWrite5mPrice = 0.125m, CacheWrite1hPrice = 0.2m, CacheReadPrice = 0.01m, OutputPrice = 0.5m },
        new() { Model = "claude-opus-5-5", EffectiveDate = new DateOnly(2026, 6, 1),
            InputPrice = 3m, CacheWrite5mPrice = 3.75m, CacheWrite1hPrice = 6m, CacheReadPrice = 0.15m, OutputPrice = 15m },
    ];

    private static ModelPrice Clone(ModelPrice p) => new()
    {
        Model = p.Model, EffectiveDate = p.EffectiveDate,
        InputPrice = p.InputPrice, CacheWrite5mPrice = p.CacheWrite5mPrice, CacheWrite1hPrice = p.CacheWrite1hPrice,
        CacheReadPrice = p.CacheReadPrice, OutputPrice = p.OutputPrice,
    };

    private static IEnumerable<ModelPrice> Sorted(IEnumerable<ModelPrice> prices) =>
        prices.OrderBy(p => p.Model, StringComparer.Ordinal).ThenByDescending(p => p.EffectiveDate).Select(Clone).ToList();

    private ModelPrice? Find(string model, DateOnly date) =>
        _prices.FirstOrDefault(p => string.Equals(p.Model, model, StringComparison.OrdinalIgnoreCase) && p.EffectiveDate == date);

    public Task<IEnumerable<ModelPrice>> GetAllAsync() => Task.FromResult(Sorted(_prices));

    public Task<IEnumerable<ModelPrice>> QueryAsync(ModelPriceQuery q)
    {
        var result = _prices.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(q.Keyword))
        {
            var k = q.Keyword.Trim();
            result = result.Where(p => p.Model.Contains(k, StringComparison.OrdinalIgnoreCase));
        }
        if (q.EffectiveDateFrom.HasValue) result = result.Where(p => p.EffectiveDate >= q.EffectiveDateFrom.Value);
        if (q.EffectiveDateTo.HasValue) result = result.Where(p => p.EffectiveDate <= q.EffectiveDateTo.Value);
        return Task.FromResult(Sorted(result));
    }

    public Task<ModelPrice?> GetByIdAsync(string model, DateOnly effectiveDate) =>
        Task.FromResult(Find(model, effectiveDate) is { } p ? Clone(p) : null);

    public Task<bool> ExistsAsync(string model, DateOnly effectiveDate) =>
        Task.FromResult(Find(model, effectiveDate) is not null);

    public Task<ModelPrice> CreateAsync(ModelPriceRequest r)
    {
        var price = new ModelPrice
        {
            Model = r.Model, EffectiveDate = r.EffectiveDate,
            InputPrice = r.InputPrice, CacheWrite5mPrice = r.CacheWrite5mPrice, CacheWrite1hPrice = r.CacheWrite1hPrice,
            CacheReadPrice = r.CacheReadPrice, OutputPrice = r.OutputPrice,
        };
        _prices.Add(price);
        FakeTransaction.OnRollback(() => _prices.Remove(price));
        return Task.FromResult(Clone(price));
    }

    public Task<ModelPrice?> UpdateAsync(ModelPriceRequest r)
    {
        var price = Find(r.Model, r.EffectiveDate);
        if (price is null) return Task.FromResult<ModelPrice?>(null);
        var before = Clone(price);
        FakeTransaction.OnRollback(() => { _prices.Remove(price); _prices.Add(before); });
        price.InputPrice = r.InputPrice;
        price.CacheWrite5mPrice = r.CacheWrite5mPrice;
        price.CacheWrite1hPrice = r.CacheWrite1hPrice;
        price.CacheReadPrice = r.CacheReadPrice;
        price.OutputPrice = r.OutputPrice;
        return Task.FromResult<ModelPrice?>(Clone(price));
    }

    public Task<bool> DeleteAsync(string model, DateOnly effectiveDate)
    {
        var price = Find(model, effectiveDate);
        if (price is null || !_prices.Remove(price)) return Task.FromResult(false);
        FakeTransaction.OnRollback(() => _prices.Add(price));
        return Task.FromResult(true);
    }
}
