using System.Data.Common;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Services;
using Dapper;

namespace CMS.API.Repositories;

public class AppRoleRepository(IDbConnectionFactory connectionFactory, RowAuditWriter audit) : IAppRoleRepository
{
    private const string TableName = "AppRole";

    private const string SelectSql = """
        SELECT r.pkid AS Pkid,
               RTRIM(r.RoleId) AS RoleId,
               r.RoleName,
               r.PermissionLevel,
               r.Description,
               (SELECT COUNT(*) FROM AppUserRole ur WHERE ur.RoleId = r.RoleId) AS UserCount
        FROM AppRole r
        """;

    public async Task<IEnumerable<AppRole>> GetAllAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<AppRole>($"{SelectSql} ORDER BY r.RoleId");
    }

    public async Task<IEnumerable<AppRole>> QueryAsync(AppRoleQuery query)
    {
        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("(r.RoleId LIKE @Keyword OR r.RoleName LIKE @Keyword OR r.Description LIKE @Keyword)");
            p.Add("Keyword", $"%{query.Keyword.Trim()}%");
        }
        if (query.MinPermissionLevel.HasValue)
        {
            where.Add("r.PermissionLevel >= @MinLevel");
            p.Add("MinLevel", query.MinPermissionLevel.Value);
        }
        if (query.MaxPermissionLevel.HasValue)
        {
            where.Add("r.PermissionLevel <= @MaxLevel");
            p.Add("MaxLevel", query.MaxPermissionLevel.Value);
        }

        var sql = SelectSql
            + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "")
            + " ORDER BY r.RoleId";

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<AppRole>(sql, p);
    }

    public async Task<AppRole?> GetByIdAsync(string roleId)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await GetByIdAsync(conn, roleId);
    }

    private static async Task<AppRole?> GetByIdAsync(DbConnection conn, string roleId)
    {
        var role = await conn.QuerySingleOrDefaultAsync<AppRole>(
            $"{SelectSql} WHERE r.RoleId = @roleId", new { roleId });
        if (role is null) return null;

        var userIds = await conn.QueryAsync<string>(
            "SELECT RTRIM(UserId) FROM AppUserRole WHERE RoleId = @roleId ORDER BY UserId", new { roleId });
        role.UserIds = userIds.ToList();
        return role;
    }

    public async Task<bool> ExistsAsync(string roleId)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM AppRole WHERE RoleId = @roleId", new { roleId }) > 0;
    }

    public async Task<AppRole> CreateAsync(AppRoleRequest request)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();

        await conn.ExecuteAsync(
            """
            INSERT INTO AppRole (RoleId, RoleName, PermissionLevel, Description)
            VALUES (@RoleId, @RoleName, @PermissionLevel, @Description)
            """, request);
        await ReplaceUsersAsync(conn, request);

        var created = (await GetByIdAsync(conn, request.RoleId))!;
        await audit.LogInsertAsync(conn, TableName, created);
        scope.Complete();
        return created;
    }

    public async Task<AppRole?> UpdateAsync(AppRoleRequest request)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var before = await GetByIdAsync(conn, request.RoleId);
        if (before is null)
        {
            scope.Complete(); // nothing written: leaving the scope incomplete would doom an outer transaction
            return null;
        }

        await conn.ExecuteAsync(
            """
            UPDATE AppRole
            SET RoleName = @RoleName, PermissionLevel = @PermissionLevel, Description = @Description
            WHERE RoleId = @RoleId
            """, request);
        await ReplaceUsersAsync(conn, request);

        var after = (await GetByIdAsync(conn, request.RoleId))!;
        await audit.LogUpdateAsync(conn, TableName, before, after);
        scope.Complete();
        return after;
    }

    public async Task<bool> DeleteAsync(string roleId)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var row = await GetByIdAsync(conn, roleId);
        if (row is null)
        {
            scope.Complete(); // nothing written: leaving the scope incomplete would doom an outer transaction
            return false;
        }

        await conn.ExecuteAsync("DELETE FROM AppUserRole WHERE RoleId = @roleId", new { roleId });
        await conn.ExecuteAsync("DELETE FROM AppRole WHERE RoleId = @roleId", new { roleId });
        await audit.LogDeleteAsync(conn, TableName, row);
        scope.Complete();
        return true;
    }

    public async Task<IEnumerable<AppUserLookup>> GetUserLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<AppUserLookup>(
            "SELECT RTRIM(UserId) AS UserId, UserName FROM AppUser ORDER BY UserName");
    }

    // n-n: delete-then-reinsert
    private static async Task ReplaceUsersAsync(
        DbConnection conn, AppRoleRequest request)
    {
        await conn.ExecuteAsync("DELETE FROM AppUserRole WHERE RoleId = @RoleId", new { request.RoleId });

        var rows = request.UserIds.Distinct().Select(userId => new { UserId = userId, request.RoleId });
        await conn.ExecuteAsync(
            "INSERT INTO AppUserRole (UserId, RoleId) VALUES (@UserId, @RoleId)", rows);
    }
}
