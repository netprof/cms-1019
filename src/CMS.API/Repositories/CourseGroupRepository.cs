using System.Data.Common;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Services;
using Dapper;

namespace CMS.API.Repositories;

public class CourseGroupRepository(IDbConnectionFactory connectionFactory, RowAuditWriter audit) : ICourseGroupRepository
{
    private const string TableName = "CourseGroup";

    private const string SelectSql = """
        SELECT g.pkid AS Pkid,
               g.Description
        FROM CourseGroup g
        """;

    private const string OrderBy = " ORDER BY g.pkid";

    public async Task<IEnumerable<CourseGroup>> GetAllAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<CourseGroup>(SelectSql + OrderBy);
    }

    public async Task<IEnumerable<CourseGroup>> QueryAsync(CourseGroupQuery query)
    {
        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("g.Description LIKE @Keyword");
            p.Add("Keyword", $"%{query.Keyword.Trim()}%");
        }

        var sql = SelectSql
            + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "")
            + OrderBy;

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<CourseGroup>(sql, p);
    }

    public async Task<CourseGroup?> GetByIdAsync(short pkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await GetByIdAsync(conn, pkid);
    }

    private static Task<CourseGroup?> GetByIdAsync(DbConnection conn, short pkid) =>
        conn.QuerySingleOrDefaultAsync<CourseGroup>($"{SelectSql} WHERE g.pkid = @pkid", new { pkid });

    public async Task<CourseGroup> CreateAsync(CourseGroupRequest request)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var pkid = await conn.ExecuteScalarAsync<short>(
            """
            INSERT INTO CourseGroup (Description)
            VALUES (@Description);
            SELECT CAST(SCOPE_IDENTITY() AS smallint);
            """, request);

        var created = (await GetByIdAsync(conn, pkid))!;
        await audit.LogInsertAsync(conn, TableName, created);
        scope.Complete();
        return created;
    }

    public async Task<CourseGroup?> UpdateAsync(CourseGroupRequest request)
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
            UPDATE CourseGroup
            SET Description = @Description
            WHERE pkid = @Pkid
            """, request);

        var after = (await GetByIdAsync(conn, request.Pkid))!;
        await audit.LogUpdateAsync(conn, TableName, before, after);
        scope.Complete();
        return after;
    }

    public async Task<bool> IsInUseAsync(short pkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.ExecuteScalarAsync<bool>(
            """
            SELECT CASE WHEN EXISTS (SELECT 1 FROM Course WHERE CourseGroup_pkid = @pkid)
                          OR EXISTS (SELECT 1 FROM PartnerCourseGroup WHERE CourseGroup_pkid = @pkid)
                   THEN 1 ELSE 0 END
            """, new { pkid });
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

        await conn.ExecuteAsync("DELETE FROM CourseGroup WHERE pkid = @pkid", new { pkid });
        await audit.LogDeleteAsync(conn, TableName, row);
        scope.Complete();
        return true;
    }

    public async Task<IEnumerable<CourseGroupLookup>> GetLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<CourseGroupLookup>(
            "SELECT pkid AS Pkid, Description FROM CourseGroup ORDER BY pkid");
    }
}
