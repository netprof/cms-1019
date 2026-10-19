using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public class AppRoleRepository(IDbConnectionFactory connectionFactory) : IAppRoleRepository
{
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
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        using var tx = conn.BeginTransaction();

        await conn.ExecuteAsync(
            """
            INSERT INTO AppRole (RoleId, RoleName, PermissionLevel, Description)
            VALUES (@RoleId, @RoleName, @PermissionLevel, @Description)
            """, request, tx);
        await ReplaceUsersAsync(conn, tx, request);
        await tx.CommitAsync();

        return (await GetByIdAsync(request.RoleId))!;
    }

    public async Task<AppRole?> UpdateAsync(AppRoleRequest request)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        using var tx = conn.BeginTransaction();

        var rows = await conn.ExecuteAsync(
            """
            UPDATE AppRole
            SET RoleName = @RoleName, PermissionLevel = @PermissionLevel, Description = @Description
            WHERE RoleId = @RoleId
            """, request, tx);
        if (rows == 0) return null;

        await ReplaceUsersAsync(conn, tx, request);
        await tx.CommitAsync();

        return await GetByIdAsync(request.RoleId);
    }

    public async Task<bool> DeleteAsync(string roleId)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        using var tx = conn.BeginTransaction();

        await conn.ExecuteAsync("DELETE FROM AppUserRole WHERE RoleId = @roleId", new { roleId }, tx);
        var rows = await conn.ExecuteAsync("DELETE FROM AppRole WHERE RoleId = @roleId", new { roleId }, tx);
        await tx.CommitAsync();
        return rows > 0;
    }

    public async Task<IEnumerable<AppUserLookup>> GetUserLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<AppUserLookup>(
            "SELECT RTRIM(UserId) AS UserId, UserName FROM AppUser ORDER BY UserName");
    }

    // n-n: delete-then-reinsert
    private static async Task ReplaceUsersAsync(
        System.Data.Common.DbConnection conn, System.Data.Common.DbTransaction tx, AppRoleRequest request)
    {
        await conn.ExecuteAsync("DELETE FROM AppUserRole WHERE RoleId = @RoleId", new { request.RoleId }, tx);

        var rows = request.UserIds.Distinct().Select(userId => new { UserId = userId, request.RoleId });
        await conn.ExecuteAsync(
            "INSERT INTO AppUserRole (UserId, RoleId) VALUES (@UserId, @RoleId)", rows, tx);
    }
}
