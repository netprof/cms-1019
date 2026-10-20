using System.Data.Common;
using System.Text.Json;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Services;
using Dapper;

namespace CMS.API.Repositories;

public class AppUserRepository(IDbConnectionFactory connectionFactory, RowAuditWriter audit) : IAppUserRepository
{
    private const string TableName = "AppUser";

    // PasswordHash is intentionally never selected.
    private const string SelectSql = """
        SELECT u.pkid AS Pkid,
               RTRIM(u.UserId) AS UserId,
               u.UserName,
               u.IsActive,
               u.PasswordUpdatedTime,
               (SELECT COUNT(*) FROM AppUserRole ur WHERE ur.UserId = u.UserId) AS RoleCount
        FROM AppUser u
        """;

    private const string OrderBy = " ORDER BY u.UserId";

    public async Task<IEnumerable<AppUser>> GetAllAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<AppUser>(SelectSql + OrderBy);
    }

    public async Task<IEnumerable<AppUser>> QueryAsync(AppUserQuery query)
    {
        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("(u.UserId LIKE @Keyword OR u.UserName LIKE @Keyword)");
            p.Add("Keyword", $"%{query.Keyword.Trim()}%");
        }
        if (query.IsActive.HasValue)
        {
            where.Add("u.IsActive = @IsActive");
            p.Add("IsActive", query.IsActive.Value);
        }
        if (!string.IsNullOrWhiteSpace(query.RoleId))
        {
            where.Add("EXISTS (SELECT 1 FROM AppUserRole ur WHERE ur.UserId = u.UserId AND ur.RoleId = @RoleId)");
            p.Add("RoleId", query.RoleId.Trim());
        }
        if (query.PasswordUpdatedFrom.HasValue)
        {
            where.Add("u.PasswordUpdatedTime >= @From");
            p.Add("From", query.PasswordUpdatedFrom.Value.ToDateTime(TimeOnly.MinValue));
        }
        if (query.PasswordUpdatedTo.HasValue)
        {
            // Inclusive end date: strictly before the start of the next day.
            where.Add("u.PasswordUpdatedTime < @ToExclusive");
            p.Add("ToExclusive", query.PasswordUpdatedTo.Value.AddDays(1).ToDateTime(TimeOnly.MinValue));
        }

        var sql = SelectSql
            + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "")
            + OrderBy;

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<AppUser>(sql, p);
    }

    public async Task<AppUser?> GetByIdAsync(string userId)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await GetByIdAsync(conn, userId);
    }

    private static async Task<AppUser?> GetByIdAsync(DbConnection conn, string userId)
    {
        var user = await conn.QuerySingleOrDefaultAsync<AppUser>(
            $"{SelectSql} WHERE u.UserId = @userId", new { userId });
        if (user is null) return null;

        var roleIds = await conn.QueryAsync<string>(
            "SELECT RTRIM(RoleId) FROM AppUserRole WHERE UserId = @userId ORDER BY RoleId", new { userId });
        user.RoleIds = roleIds.ToList();
        return user;
    }

    public async Task<bool> ExistsAsync(string userId)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM AppUser WHERE UserId = @userId", new { userId }) > 0;
    }

    public async Task<bool> IsActiveUserAsync(string userId)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM AppUser WHERE UserId = @userId AND IsActive = 1", new { userId }) > 0;
    }

    public async Task<AppUser> CreateAsync(AppUserRequest request, string passwordHash)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();

        await conn.ExecuteAsync(
            """
            INSERT INTO AppUser (UserId, UserName, IsActive, PasswordHash, PasswordUpdatedTime)
            VALUES (@UserId, @UserName, @IsActive, @PasswordHash, @PasswordUpdatedTime)
            """,
            new
            {
                request.UserId, request.UserName, request.IsActive,
                PasswordHash = passwordHash, PasswordUpdatedTime = DateTime.UtcNow,
            });
        await ReplaceRolesAsync(conn, request);

        var created = (await GetByIdAsync(conn, request.UserId))!;
        await audit.LogInsertAsync(conn, TableName, created);
        scope.Complete();
        return created;
    }

    public async Task<AppUser?> UpdateAsync(AppUserRequest request)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var before = await GetByIdAsync(conn, request.UserId);
        if (before is null)
        {
            scope.Complete(); // nothing written: leaving the scope incomplete would doom an outer transaction
            return null;
        }

        // PasswordHash / PasswordUpdatedTime are deliberately not in the SET list.
        await conn.ExecuteAsync(
            """
            UPDATE AppUser
            SET UserName = @UserName, IsActive = @IsActive
            WHERE UserId = @UserId
            """, request);
        await ReplaceRolesAsync(conn, request);

        var after = (await GetByIdAsync(conn, request.UserId))!;
        await audit.LogUpdateAsync(conn, TableName, before, after);
        scope.Complete();
        return after;
    }

    public async Task<bool> DeleteAsync(string userId)
    {
        using var scope = DbTransactionScope.Begin();
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var row = await GetByIdAsync(conn, userId);
        if (row is null)
        {
            scope.Complete(); // nothing written: leaving the scope incomplete would doom an outer transaction
            return false;
        }

        await conn.ExecuteAsync("DELETE FROM AppUserRole WHERE UserId = @userId", new { userId });
        await conn.ExecuteAsync("DELETE FROM AppUser WHERE UserId = @userId", new { userId });
        await audit.LogDeleteAsync(conn, TableName, row);
        scope.Complete();
        return true;
    }

    public async Task<string> GetDefaultPasswordAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var json = await conn.ExecuteScalarAsync<string?>(
            "SELECT configValue FROM SysConfig WHERE configKey = 'appConfig'");
        if (string.IsNullOrWhiteSpace(json))
            throw new InvalidOperationException("SysConfig 'appConfig' row is missing.");

        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("defaultPassword", out var prop)
            || prop.ValueKind != JsonValueKind.String
            || string.IsNullOrEmpty(prop.GetString()))
        {
            throw new InvalidOperationException("SysConfig 'appConfig' has no defaultPassword.");
        }
        return prop.GetString()!;
    }

    public async Task<IEnumerable<AppRoleLookup>> GetRoleLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<AppRoleLookup>(
            "SELECT RTRIM(RoleId) AS RoleId, RoleName FROM AppRole ORDER BY RoleId");
    }

    // n-n: delete-then-reinsert
    private static async Task ReplaceRolesAsync(
        DbConnection conn, AppUserRequest request)
    {
        await conn.ExecuteAsync("DELETE FROM AppUserRole WHERE UserId = @UserId", new { request.UserId });

        var rows = request.RoleIds.Distinct().Select(roleId => new { request.UserId, RoleId = roleId });
        await conn.ExecuteAsync(
            "INSERT INTO AppUserRole (UserId, RoleId) VALUES (@UserId, @RoleId)", rows);
    }
}
