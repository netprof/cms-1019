using System.Text.Json;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public class AuthRepository(IDbConnectionFactory connectionFactory) : IAuthRepository
{
    public async Task<LoginCredential?> GetCredentialAsync(string userId)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QuerySingleOrDefaultAsync<LoginCredential>(
            """
            SELECT UserId, UserName, IsActive, PasswordHash
            FROM AppUser
            WHERE UserId = @userId
            """, new { userId });
    }

    public async Task<IReadOnlyList<string>> GetRoleIdsAsync(string userId)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var roleIds = await conn.QueryAsync<string>(
            "SELECT RTRIM(RoleId) FROM AppUserRole WHERE UserId = @userId ORDER BY RoleId", new { userId });
        return roleIds.ToList();
    }

    public async Task<string> GetJwtSigningKeyAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var json = await conn.ExecuteScalarAsync<string?>(
            "SELECT configValue FROM SysConfig WHERE configKey = 'appConfig'");
        if (string.IsNullOrWhiteSpace(json))
            throw new InvalidOperationException("SysConfig 'appConfig' row is missing.");

        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("symmetricSecurityKey", out var prop)
            || prop.ValueKind != JsonValueKind.String
            || string.IsNullOrEmpty(prop.GetString()))
        {
            throw new InvalidOperationException("SysConfig 'appConfig' has no symmetricSecurityKey.");
        }
        return prop.GetString()!;
    }
}
