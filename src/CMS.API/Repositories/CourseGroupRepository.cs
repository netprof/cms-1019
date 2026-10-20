using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public class CourseGroupRepository(IDbConnectionFactory connectionFactory) : ICourseGroupRepository
{
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
        return await conn.QuerySingleOrDefaultAsync<CourseGroup>(
            $"{SelectSql} WHERE g.pkid = @pkid", new { pkid });
    }

    public async Task<CourseGroup> CreateAsync(CourseGroupRequest request)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var pkid = await conn.ExecuteScalarAsync<short>(
            """
            INSERT INTO CourseGroup (Description)
            VALUES (@Description);
            SELECT CAST(SCOPE_IDENTITY() AS smallint);
            """, request);

        return (await GetByIdAsync(pkid))!;
    }

    public async Task<CourseGroup?> UpdateAsync(CourseGroupRequest request)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var rows = await conn.ExecuteAsync(
            """
            UPDATE CourseGroup
            SET Description = @Description
            WHERE pkid = @Pkid
            """, request);
        if (rows == 0) return null;

        return await GetByIdAsync(request.Pkid);
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
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var rows = await conn.ExecuteAsync("DELETE FROM CourseGroup WHERE pkid = @pkid", new { pkid });
        return rows > 0;
    }

    public async Task<IEnumerable<CourseGroupLookup>> GetLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<CourseGroupLookup>(
            "SELECT pkid AS Pkid, Description FROM CourseGroup ORDER BY pkid");
    }
}
