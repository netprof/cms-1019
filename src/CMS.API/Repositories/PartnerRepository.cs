using System.Data.Common;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Services;
using Dapper;

namespace CMS.API.Repositories;

public class PartnerRepository(IDbConnectionFactory connectionFactory, RowAuditWriter audit) : IPartnerRepository
{
    private const string TableName = "Partner";

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
        return await GetByIdAsync(conn, pkid);
    }

    private static Task<Partner?> GetByIdAsync(DbConnection conn, short pkid) =>
        conn.QuerySingleOrDefaultAsync<Partner>($"{SelectSql} WHERE p.pkid = @pkid", new { pkid });

    public async Task<Partner> CreateAsync(PartnerRequest request)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var pkid = await conn.ExecuteScalarAsync<short>(
            """
            INSERT INTO Partner (Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage, DisplayOrder, ImageFilename)
            VALUES (@Name, @AppKey, @NameOnPartnerMenu, @NameOnCourseDetailPage, @DisplayOrder, @ImageFilename);
            SELECT CAST(SCOPE_IDENTITY() AS smallint);
            """, request);

        var created = (await GetByIdAsync(conn, pkid))!;
        await audit.LogInsertAsync(conn, TableName, created);
        scope.Complete();
        return created;
    }

    public async Task<Partner?> UpdateAsync(PartnerRequest request)
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
            UPDATE Partner
            SET Name = @Name,
                AppKey = @AppKey,
                NameOnPartnerMenu = @NameOnPartnerMenu,
                NameOnCourseDetailPage = @NameOnCourseDetailPage,
                DisplayOrder = @DisplayOrder,
                ImageFilename = @ImageFilename
            WHERE pkid = @Pkid
            """, request);

        var after = (await GetByIdAsync(conn, request.Pkid))!;
        await audit.LogUpdateAsync(conn, TableName, before, after);
        scope.Complete();
        return after;
    }

    public async Task<bool> DeleteAsync(short pkid)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var row = await GetByIdAsync(conn, pkid);
        if (row is null)
        {
            scope.Complete(); // nothing written: leaving the scope incomplete would doom an outer transaction
            return false;
        }

        await conn.ExecuteAsync("DELETE FROM Partner WHERE pkid = @pkid", new { pkid });
        await audit.LogDeleteAsync(conn, TableName, row);
        scope.Complete();
        return true;
    }

    public async Task<IEnumerable<PartnerLookup>> GetLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<PartnerLookup>(
            "SELECT pkid AS Pkid, Name FROM Partner ORDER BY DisplayOrder, pkid");
    }
}
