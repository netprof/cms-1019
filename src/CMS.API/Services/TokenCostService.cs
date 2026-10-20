using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Services;

/// <summary>
/// Prices <see cref="TokenUsage"/> rows from the <see cref="ModelPrice"/> list. A row's price is the
/// one for its model with the latest <c>EffectiveDate &lt;= UsageDate</c>; with none, its cost is null.
/// </summary>
public class TokenCostService(IModelPriceRepository prices, ITokenUsageRepository usages)
{
    private const decimal TokensPerPriceUnit = 1_000_000m;

    /// <summary>Sets <see cref="TokenUsage.Cost"/> on each row (in memory; the caller stores them).</summary>
    public async Task PriceAsync(IEnumerable<TokenUsage> rows)
    {
        var all = (await prices.GetAllAsync()).ToList();
        foreach (var row in rows) row.Cost = CostOf(row, all);
    }

    /// <summary>Recomputes and stores the cost of every usage row for <paramref name="model"/>.</summary>
    public async Task RecomputeModelAsync(string model)
    {
        var rows = (await usages.GetByModelAsync(model)).ToList();
        if (rows.Count == 0) return;

        await PriceAsync(rows);
        await usages.UpdateCostsAsync(rows);
    }

    private static decimal? CostOf(TokenUsage row, IEnumerable<ModelPrice> all)
    {
        // Model matches case-insensitively, like SQL Server's default collation.
        var price = all
            .Where(p => string.Equals(p.Model, row.Model, StringComparison.OrdinalIgnoreCase)
                && p.EffectiveDate <= row.UsageDate)
            .MaxBy(p => p.EffectiveDate);
        if (price is null) return null;

        var cost = (row.InputTokens * price.InputPrice
            + row.CacheWrite5mTokens * price.CacheWrite5mPrice
            + row.CacheWrite1hTokens * price.CacheWrite1hPrice
            + row.CacheReadTokens * price.CacheReadPrice
            + row.OutputTokens * price.OutputPrice) / TokensPerPriceUnit;

        // TokenUsage.Cost is decimal(18,6).
        return Math.Round(cost, 6, MidpointRounding.AwayFromZero);
    }
}
