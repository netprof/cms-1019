using System.Data.Common;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Services;
using Dapper;

namespace CMS.API.Repositories;

public class PublishStatusRepository(IDbConnectionFactory connectionFactory, RowAuditWriter audit) : IPublishStatusRepository
{
    private const string TableName = "PublishStatus";

    private const string SelectSql = """
        SELECT s.pkid AS Pkid,
               s.Description,
               s.IsDraft,
               s.IsPublished,
               s.IsDiscontinued
        FROM PublishStatus s
        """;

    public async Task<IEnumerable<PublishStatus>> GetAllAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<PublishStatus>($"{SelectSql} ORDER BY s.pkid");
    }

    public async Task<IEnumerable<PublishStatus>> QueryAsync(PublishStatusQuery query)
    {
        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("s.Description LIKE @Keyword");
            p.Add("Keyword", $"%{query.Keyword.Trim()}%");
        }
        if (query.IsDraft.HasValue)
        {
            where.Add("s.IsDraft = @IsDraft");
            p.Add("IsDraft", query.IsDraft.Value);
        }
        if (query.IsPublished.HasValue)
        {
            where.Add("s.IsPublished = @IsPublished");
            p.Add("IsPublished", query.IsPublished.Value);
        }
        if (query.IsDiscontinued.HasValue)
        {
            where.Add("s.IsDiscontinued = @IsDiscontinued");
            p.Add("IsDiscontinued", query.IsDiscontinued.Value);
        }

        var sql = SelectSql
            + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "")
            + " ORDER BY s.pkid";

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<PublishStatus>(sql, p);
    }

    public async Task<PublishStatus?> GetByIdAsync(byte pkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await GetByIdAsync(conn, pkid);
    }

    private static Task<PublishStatus?> GetByIdAsync(DbConnection conn, byte pkid) =>
        conn.QuerySingleOrDefaultAsync<PublishStatus>($"{SelectSql} WHERE s.pkid = @pkid", new { pkid });

    public async Task<bool> ExistsAsync(byte pkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM PublishStatus WHERE pkid = @pkid", new { pkid }) > 0;
    }

    public async Task<PublishStatus> CreateAsync(PublishStatusRequest request)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        await conn.ExecuteAsync(
            """
            INSERT INTO PublishStatus (pkid, Description, IsDraft, IsPublished, IsDiscontinued)
            VALUES (@Pkid, @Description, @IsDraft, @IsPublished, @IsDiscontinued)
            """, request);

        var created = (await GetByIdAsync(conn, request.Pkid))!;
        await audit.LogInsertAsync(conn, TableName, created);
        scope.Complete();
        return created;
    }

    public async Task<PublishStatus?> UpdateAsync(PublishStatusRequest request)
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
            UPDATE PublishStatus
            SET Description = @Description,
                IsDraft = @IsDraft,
                IsPublished = @IsPublished,
                IsDiscontinued = @IsDiscontinued
            WHERE pkid = @Pkid
            """, request);

        var after = (await GetByIdAsync(conn, request.Pkid))!;
        await audit.LogUpdateAsync(conn, TableName, before, after);
        scope.Complete();
        return after;
    }

    public async Task<bool> DeleteAsync(byte pkid)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var row = await GetByIdAsync(conn, pkid);
        if (row is null)
        {
            scope.Complete(); // nothing written: leaving the scope incomplete would doom an outer transaction
            return false;
        }

        await conn.ExecuteAsync("DELETE FROM PublishStatus WHERE pkid = @pkid", new { pkid });
        await audit.LogDeleteAsync(conn, TableName, row);
        scope.Complete();
        return true;
    }

    public async Task<IEnumerable<PublishStatusLookup>> GetLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<PublishStatusLookup>(
            "SELECT pkid AS Pkid, Description FROM PublishStatus ORDER BY pkid");
    }
}
