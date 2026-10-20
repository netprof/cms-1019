using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public class ModelPriceRepository(IDbConnectionFactory connectionFactory) : IModelPriceRepository
{
    private const string SelectSql = """
        SELECT m.Model,
               m.EffectiveDate,
               m.InputPrice,
               m.CacheWrite5mPrice,
               m.CacheWrite1hPrice,
               m.CacheReadPrice,
               m.OutputPrice
        FROM ModelPrice m
        """;

    private const string OrderBy = " ORDER BY m.Model, m.EffectiveDate DESC";

    private const string KeyWhere = " WHERE m.Model = @model AND m.EffectiveDate = @effectiveDate";

    public async Task<IEnumerable<ModelPrice>> GetAllAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<ModelPrice>(SelectSql + OrderBy);
    }

    public async Task<IEnumerable<ModelPrice>> QueryAsync(ModelPriceQuery query)
    {
        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("m.Model LIKE @Keyword");
            p.Add("Keyword", $"%{query.Keyword.Trim()}%");
        }
        if (query.EffectiveDateFrom.HasValue)
        {
            where.Add("m.EffectiveDate >= @EffectiveDateFrom");
            p.Add("EffectiveDateFrom", query.EffectiveDateFrom.Value);
        }
        if (query.EffectiveDateTo.HasValue)
        {
            where.Add("m.EffectiveDate <= @EffectiveDateTo");
            p.Add("EffectiveDateTo", query.EffectiveDateTo.Value);
        }

        var sql = SelectSql
            + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "")
            + OrderBy;

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<ModelPrice>(sql, p);
    }

    public async Task<ModelPrice?> GetByIdAsync(string model, DateOnly effectiveDate)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<ModelPrice>(SelectSql + KeyWhere, new { model, effectiveDate });
    }

    public async Task<bool> ExistsAsync(string model, DateOnly effectiveDate)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM ModelPrice m" + KeyWhere, new { model, effectiveDate }) > 0;
    }

    public async Task<ModelPrice> CreateAsync(ModelPriceRequest request)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        await conn.ExecuteAsync(
            """
            INSERT INTO ModelPrice (Model, EffectiveDate, InputPrice, CacheWrite5mPrice, CacheWrite1hPrice, CacheReadPrice, OutputPrice)
            VALUES (@Model, @EffectiveDate, @InputPrice, @CacheWrite5mPrice, @CacheWrite1hPrice, @CacheReadPrice, @OutputPrice)
            """, request);

        return (await GetByIdAsync(request.Model, request.EffectiveDate))!;
    }

    public async Task<ModelPrice?> UpdateAsync(ModelPriceRequest request)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var rows = await conn.ExecuteAsync(
            """
            UPDATE ModelPrice
            SET InputPrice = @InputPrice,
                CacheWrite5mPrice = @CacheWrite5mPrice,
                CacheWrite1hPrice = @CacheWrite1hPrice,
                CacheReadPrice = @CacheReadPrice,
                OutputPrice = @OutputPrice
            WHERE Model = @Model AND EffectiveDate = @EffectiveDate
            """, request);
        if (rows == 0) return null;

        return await GetByIdAsync(request.Model, request.EffectiveDate);
    }

    public async Task<bool> DeleteAsync(string model, DateOnly effectiveDate)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var rows = await conn.ExecuteAsync(
            "DELETE FROM ModelPrice WHERE Model = @model AND EffectiveDate = @effectiveDate",
            new { model, effectiveDate });
        return rows > 0;
    }
}
