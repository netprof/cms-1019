using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public class PublishStatusRepository(IDbConnectionFactory connectionFactory) : IPublishStatusRepository
{
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
        return await conn.QuerySingleOrDefaultAsync<PublishStatus>(
            $"{SelectSql} WHERE s.pkid = @pkid", new { pkid });
    }

    public async Task<bool> ExistsAsync(byte pkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM PublishStatus WHERE pkid = @pkid", new { pkid }) > 0;
    }

    public async Task<PublishStatus> CreateAsync(PublishStatusRequest request)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        await conn.ExecuteAsync(
            """
            INSERT INTO PublishStatus (pkid, Description, IsDraft, IsPublished, IsDiscontinued)
            VALUES (@Pkid, @Description, @IsDraft, @IsPublished, @IsDiscontinued)
            """, request);

        return (await GetByIdAsync(request.Pkid))!;
    }

    public async Task<PublishStatus?> UpdateAsync(PublishStatusRequest request)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var rows = await conn.ExecuteAsync(
            """
            UPDATE PublishStatus
            SET Description = @Description,
                IsDraft = @IsDraft,
                IsPublished = @IsPublished,
                IsDiscontinued = @IsDiscontinued
            WHERE pkid = @Pkid
            """, request);
        if (rows == 0) return null;

        return await GetByIdAsync(request.Pkid);
    }

    public async Task<bool> DeleteAsync(byte pkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var rows = await conn.ExecuteAsync("DELETE FROM PublishStatus WHERE pkid = @pkid", new { pkid });
        return rows > 0;
    }

    public async Task<IEnumerable<PublishStatusLookup>> GetLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<PublishStatusLookup>(
            "SELECT pkid AS Pkid, Description FROM PublishStatus ORDER BY pkid");
    }
}
