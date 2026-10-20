using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public class TokenUsageRepository(IDbConnectionFactory connectionFactory) : ITokenUsageRepository
{
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

    public async Task<IReadOnlyList<TokenUsageReportRow>> GetReportRowsAsync(TokenUsageReportFilter filter)
    {
        var where = new List<string>();
        var p = new DynamicParameters();

        if (filter.From.HasValue)
        {
            where.Add("t.UsageDate >= @From");
            p.Add("From", filter.From.Value);
        }
        if (filter.To.HasValue)
        {
            where.Add("t.UsageDate <= @To");
            p.Add("To", filter.To.Value);
        }
        if (!string.IsNullOrWhiteSpace(filter.UserId))
        {
            where.Add("t.UserId = @UserId");
            p.Add("UserId", filter.UserId.Trim());
        }
        if (!string.IsNullOrWhiteSpace(filter.Project))
        {
            where.Add("t.Project LIKE @Project");
            p.Add("Project", $"%{filter.Project.Trim()}%");
        }
        if (!string.IsNullOrWhiteSpace(filter.Model))
        {
            where.Add("t.Model LIKE @Model");
            p.Add("Model", $"%{filter.Model.Trim()}%");
        }

        // SUM(Cost) ignores NULLs and is NULL only when every row in the group is unpriced.
        var sql = $"""
            SELECT t.UserId, u.UserName, t.UsageDate, t.Project, t.Model,
                   SUM(t.InputTokens) AS InputTokens,
                   SUM(t.CacheWrite5mTokens) AS CacheWrite5mTokens,
                   SUM(t.CacheWrite1hTokens) AS CacheWrite1hTokens,
                   SUM(t.CacheReadTokens) AS CacheReadTokens,
                   SUM(t.OutputTokens) AS OutputTokens,
                   SUM(t.Cost) AS Cost
            FROM TokenUsage t
            JOIN AppUser u ON u.UserId = t.UserId
            {(where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "")}
            GROUP BY t.UserId, u.UserName, t.UsageDate, t.Project, t.Model
            """;

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return (await conn.QueryAsync<TokenUsageReportRow>(sql, p)).ToList();
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
        // A scope, not a local transaction, so a caller's scope (ModelPrice write + recompute) covers it too.
        using var scope = DbTransactionScope.Begin();
        using (var conn = await connectionFactory.CreateOpenConnectionAsync())
        {
            await conn.ExecuteAsync(
                """
                UPDATE TokenUsage SET Cost = @Cost
                WHERE SessionId = @SessionId AND UsageDate = @UsageDate AND Model = @Model
                """, rows);
        }
        scope.Complete();
    }
}
