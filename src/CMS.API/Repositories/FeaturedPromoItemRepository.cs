using System.Data.Common;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Services;
using Dapper;

namespace CMS.API.Repositories;

public class FeaturedPromoItemRepository(IDbConnectionFactory connectionFactory, RowAuditWriter audit) : IFeaturedPromoItemRepository
{
    private const string TableName = "FeaturedPromoItem";

    private const string SelectSql = """
        SELECT f.pkid AS Pkid,
               f.ScheduleOn,
               f.TrainingCenter_pkid AS TrainingCenterPkid,
               f.Slot,
               f.Promotion_pkid AS PromotionPkid,
               f.Topic,
               f.Description,
               p.pkid AS Pkid,
               p.PromoCode,
               p.Topic,
               p.Description
        FROM FeaturedPromoItem f
        JOIN Promotion2 p ON p.pkid = f.Promotion_pkid
        """;

    private const string OrderBy = " ORDER BY f.ScheduleOn, f.TrainingCenter_pkid, f.Slot";

    private static FeaturedPromoItem Map(FeaturedPromoItem item, PromotionLookup promotion)
    {
        item.Promotion = promotion;
        return item;
    }

    private static Task<IEnumerable<FeaturedPromoItem>> QueryItemsAsync(DbConnection conn, string sql, object? param = null) =>
        conn.QueryAsync<FeaturedPromoItem, PromotionLookup, FeaturedPromoItem>(sql, Map, param, splitOn: "Pkid");

    public async Task<IEnumerable<FeaturedPromoItem>> GetAllAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await QueryItemsAsync(conn, SelectSql + OrderBy);
    }

    public async Task<IEnumerable<FeaturedPromoItem>> QueryAsync(FeaturedPromoItemQuery query)
    {
        var where = new List<string>();
        var p = new DynamicParameters();

        if (query.TrainingCenterPkid.HasValue)
        {
            where.Add("f.TrainingCenter_pkid = @TrainingCenterPkid");
            p.Add("TrainingCenterPkid", query.TrainingCenterPkid.Value);
        }
        if (query.ScheduleOnFrom.HasValue)
        {
            where.Add("f.ScheduleOn >= @ScheduleOnFrom");
            p.Add("ScheduleOnFrom", query.ScheduleOnFrom.Value);
        }
        if (query.ScheduleOnTo.HasValue)
        {
            where.Add("f.ScheduleOn <= @ScheduleOnTo");
            p.Add("ScheduleOnTo", query.ScheduleOnTo.Value);
        }

        var sql = SelectSql
            + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "")
            + OrderBy;

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await QueryItemsAsync(conn, sql, p);
    }

    public async Task<FeaturedPromoItem?> GetByIdAsync(int pkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await GetByIdAsync(conn, pkid);
    }

    private static async Task<FeaturedPromoItem?> GetByIdAsync(DbConnection conn, int pkid) =>
        (await QueryItemsAsync(conn, $"{SelectSql} WHERE f.pkid = @pkid", new { pkid })).SingleOrDefault();

    public async Task<FeaturedPromoItem> CreateAsync(FeaturedPromoItemRequest request)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var pkid = await conn.ExecuteScalarAsync<int>(
            """
            INSERT INTO FeaturedPromoItem (ScheduleOn, TrainingCenter_pkid, Slot, Promotion_pkid, Topic, Description)
            VALUES (@ScheduleOn, @TrainingCenterPkid, @Slot, @PromotionPkid, @Topic, @Description);
            SELECT CAST(SCOPE_IDENTITY() AS int);
            """, request);
        var created = (await GetByIdAsync(conn, pkid))!;
        await audit.LogInsertAsync(conn, TableName, created);
        scope.Complete();
        return created;
    }

    public async Task<FeaturedPromoItem?> UpdateAsync(FeaturedPromoItemRequest request)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var before = await GetByIdAsync(conn, request.Pkid);
        if (before is null)
        {
            scope.Complete(); // nothing written: leaving the scope incomplete would doom an outer transaction
            return null;
        }

        await conn.ExecuteAsync(
            """
            UPDATE FeaturedPromoItem
            SET ScheduleOn = @ScheduleOn,
                TrainingCenter_pkid = @TrainingCenterPkid,
                Slot = @Slot,
                Promotion_pkid = @PromotionPkid,
                Topic = @Topic,
                Description = @Description
            WHERE pkid = @Pkid
            """, request);
        var after = (await GetByIdAsync(conn, request.Pkid))!;
        await audit.LogUpdateAsync(conn, TableName, before, after);
        scope.Complete();
        return after;
    }

    public async Task<bool> DeleteAsync(int pkid)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var row = await GetByIdAsync(conn, pkid);
        if (row is null)
        {
            scope.Complete(); // nothing written: leaving the scope incomplete would doom an outer transaction
            return false;
        }

        await conn.ExecuteAsync("DELETE FROM FeaturedPromoItem WHERE pkid = @pkid", new { pkid });
        await audit.LogDeleteAsync(conn, TableName, row);
        scope.Complete();
        return true;
    }

    public async Task<bool> IsSlotTakenAsync(DateOnly scheduleOn, short trainingCenterPkid, byte slot, int excludePkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.ExecuteScalarAsync<bool>(
            """
            SELECT CASE WHEN EXISTS (
                SELECT 1 FROM FeaturedPromoItem
                WHERE ScheduleOn = @scheduleOn AND TrainingCenter_pkid = @trainingCenterPkid
                  AND Slot = @slot AND pkid <> @excludePkid
            ) THEN 1 ELSE 0 END
            """, new { scheduleOn, trainingCenterPkid, slot, excludePkid });
    }

    public async Task MoveAsync(FeaturedPromoItem item, byte toSlot)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var key = new { item.ScheduleOn, item.TrainingCenterPkid, fromSlot = item.Slot, toSlot };
        const string InBothSlots = """
             WHERE f.ScheduleOn = @ScheduleOn AND f.TrainingCenter_pkid = @TrainingCenterPkid
               AND f.Slot IN (@fromSlot, @toSlot)
            """;
        var before = (await QueryItemsAsync(conn, SelectSql + InBothSlots, key)).ToList();

        // One statement swaps both rows, so the (ScheduleOn, TrainingCenter, Slot) unique index
        // is only checked against the final state. Works whether or not the target slot is filled.
        await conn.ExecuteAsync(
            """
            UPDATE FeaturedPromoItem
            SET Slot = CASE WHEN Slot = @fromSlot THEN @toSlot ELSE @fromSlot END
            WHERE ScheduleOn = @ScheduleOn AND TrainingCenter_pkid = @TrainingCenterPkid
              AND Slot IN (@fromSlot, @toSlot)
            """, key);

        // One Update row ("Slot") per moved item: the item itself and the one it swapped with.
        foreach (var row in before)
            await audit.LogUpdateAsync(conn, TableName, row, (await GetByIdAsync(conn, row.Pkid))!);
        scope.Complete();
    }

    public async Task<IEnumerable<TrainingCenterLookup>> GetTrainingCenterLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<TrainingCenterLookup>(
            "SELECT pkid AS Pkid, Name FROM TrainingCenter ORDER BY DisplayOrder, pkid");
    }

    public async Task<IEnumerable<PromotionLookup>> SearchPromotionLookupsAsync(string? keyword, int limit)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<PromotionLookup>(
            """
            SELECT TOP (@limit) pkid AS Pkid, PromoCode, Topic, Description
            FROM Promotion2
            WHERE @keyword IS NULL OR PromoCode LIKE @keyword
            ORDER BY pkid DESC
            """,
            new
            {
                limit,
                keyword = string.IsNullOrWhiteSpace(keyword) ? null : $"%{keyword.Trim()}%",
            });
    }
}
