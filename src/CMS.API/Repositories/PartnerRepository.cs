using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public class PartnerRepository(IDbConnectionFactory connectionFactory) : IPartnerRepository
{
    private const string SelectSql = """
        SELECT p.pkid AS Pkid,
               p.Name,
               p.AppKey,
               p.NameOnPartnerMenu,
               p.NameOnCourseDetailPage,
               p.DisplayOrder,
               p.ImageFilename
        FROM Partner p
        """;

    private const string OrderBy = " ORDER BY p.DisplayOrder, p.pkid";

    public async Task<IEnumerable<Partner>> GetAllAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<Partner>(SelectSql + OrderBy);
    }

    public async Task<IEnumerable<Partner>> QueryAsync(PartnerQuery query)
    {
        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("""
                (p.Name LIKE @Keyword
                 OR p.AppKey LIKE @Keyword
                 OR p.NameOnPartnerMenu LIKE @Keyword
                 OR p.NameOnCourseDetailPage LIKE @Keyword)
                """);
            p.Add("Keyword", $"%{query.Keyword.Trim()}%");
        }

        var sql = SelectSql
            + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "")
            + OrderBy;

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<Partner>(sql, p);
    }

    public async Task<Partner?> GetByIdAsync(short pkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<Partner>(
            $"{SelectSql} WHERE p.pkid = @pkid", new { pkid });
    }

    public async Task<Partner> CreateAsync(PartnerRequest request)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var pkid = await conn.ExecuteScalarAsync<short>(
            """
            INSERT INTO Partner (Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage, DisplayOrder, ImageFilename)
            VALUES (@Name, @AppKey, @NameOnPartnerMenu, @NameOnCourseDetailPage, @DisplayOrder, @ImageFilename);
            SELECT CAST(SCOPE_IDENTITY() AS smallint);
            """, request);

        return (await GetByIdAsync(pkid))!;
    }

    public async Task<Partner?> UpdateAsync(PartnerRequest request)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var rows = await conn.ExecuteAsync(
            """
            UPDATE Partner
            SET Name = @Name,
                AppKey = @AppKey,
                NameOnPartnerMenu = @NameOnPartnerMenu,
                NameOnCourseDetailPage = @NameOnCourseDetailPage,
                DisplayOrder = @DisplayOrder,
                ImageFilename = @ImageFilename
            WHERE pkid = @Pkid
            """, request);
        if (rows == 0) return null;

        return await GetByIdAsync(request.Pkid);
    }

    public async Task<bool> DeleteAsync(short pkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var rows = await conn.ExecuteAsync("DELETE FROM Partner WHERE pkid = @pkid", new { pkid });
        return rows > 0;
    }

    public async Task<IEnumerable<PartnerLookup>> GetLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<PartnerLookup>(
            "SELECT pkid AS Pkid, Name FROM Partner ORDER BY DisplayOrder, pkid");
    }
}
