using System.Text.Json;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public class TokenUsageRepository(IDbConnectionFactory connectionFactory) : ITokenUsageRepository
{
    public async Task<string> GetIngestApiKeyAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var json = await conn.ExecuteScalarAsync<string?>(
            "SELECT configValue FROM SysConfig WHERE configKey = 'tokenUsageConfig'");
        if (string.IsNullOrWhiteSpace(json))
            throw new InvalidOperationException("SysConfig 'tokenUsageConfig' row is missing.");

        using var doc = JsonDocument.Parse(json);
        if (!doc.RootElement.TryGetProperty("apiKey", out var prop)
            || prop.ValueKind != JsonValueKind.String
            || string.IsNullOrEmpty(prop.GetString()))
        {
            throw new InvalidOperationException("SysConfig 'tokenUsageConfig' has no apiKey.");
        }
        return prop.GetString()!;
    }

    public async Task<bool> IsActiveUserAsync(string userId)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.ExecuteScalarAsync<int>(
            "SELECT COUNT(*) FROM AppUser WHERE UserId = @userId AND IsActive = 1", new { userId }) > 0;
    }

    public async Task ReplaceSessionAsync(string sessionId, IReadOnlyList<TokenUsage> rows)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        using var tx = conn.BeginTransaction();

        await conn.ExecuteAsync("DELETE FROM TokenUsage WHERE SessionId = @sessionId", new { sessionId }, tx);
        await conn.ExecuteAsync(
            """
            INSERT INTO TokenUsage (SessionId, UsageDate, Model, UserId, Project,
                InputTokens, CacheWrite5mTokens, CacheWrite1hTokens, CacheReadTokens, OutputTokens,
                Cost, UpdatedTime)
            VALUES (@SessionId, @UsageDate, @Model, @UserId, @Project,
                @InputTokens, @CacheWrite5mTokens, @CacheWrite1hTokens, @CacheReadTokens, @OutputTokens,
                @Cost, @UpdatedTime)
            """, rows, tx);
        await tx.CommitAsync();
    }

    public async Task<IEnumerable<TokenUsage>> GetByModelAsync(string model)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<TokenUsage>(
            """
            SELECT SessionId, UsageDate, Model, UserId, Project,
                   InputTokens, CacheWrite5mTokens, CacheWrite1hTokens, CacheReadTokens, OutputTokens,
                   Cost, UpdatedTime
            FROM TokenUsage
            WHERE Model = @model
            """, new { model });
    }

    public async Task UpdateCostsAsync(IReadOnlyList<TokenUsage> rows)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        using var tx = conn.BeginTransaction();
        await conn.ExecuteAsync(
            """
            UPDATE TokenUsage SET Cost = @Cost
            WHERE SessionId = @SessionId AND UsageDate = @UsageDate AND Model = @Model
            """, rows, tx);
        await tx.CommitAsync();
    }
}
