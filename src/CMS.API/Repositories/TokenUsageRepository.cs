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

        // A re-post without a name (older hook, untitled session) must not wipe the stored one.
        var keptName = await conn.ExecuteScalarAsync<string?>(
            "SELECT MAX(SessionName) FROM TokenUsage WHERE SessionId = @sessionId", new { sessionId }, tx);
        await conn.ExecuteAsync("DELETE FROM TokenUsage WHERE SessionId = @sessionId", new { sessionId }, tx);
        await conn.ExecuteAsync(
            """
            INSERT INTO TokenUsage (SessionId, UsageDate, Model, UserId, Project, SessionName,
                InputTokens, CacheWrite5mTokens, CacheWrite1hTokens, CacheReadTokens, OutputTokens,
                Cost, UpdatedTime)
            VALUES (@SessionId, @UsageDate, @Model, @UserId, @Project, @SessionName,
                @InputTokens, @CacheWrite5mTokens, @CacheWrite1hTokens, @CacheReadTokens, @OutputTokens,
                @Cost, @UpdatedTime)
            """, rows, tx);
        if (keptName is not null)
            await conn.ExecuteAsync(
                "UPDATE TokenUsage SET SessionName = @keptName WHERE SessionId = @sessionId AND SessionName IS NULL",
                new { sessionId, keptName }, tx);
        await tx.CommitAsync();
    }

    public async Task<IReadOnlyList<TokenUsageReportRow>> GetReportRowsAsync(TokenUsageReportFilter filter)
    {
        var (where, p) = Where(filter);

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
            {where}
            GROUP BY t.UserId, u.UserName, t.UsageDate, t.Project, t.Model
            """;

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return (await conn.QueryAsync<TokenUsageReportRow>(sql, p)).ToList();
    }

    public async Task<IReadOnlyList<TokenUsageSessionRow>> GetSessionReportRowsAsync(TokenUsageReportFilter filter)
    {
        var (where, p) = Where(filter);

        // SQL sums per (session, model); C# folds the models into one row per session, because the
        // CMS database runs at compatibility level 100, where STRING_AGG has no WITHIN GROUP ordering.
        // UserId, Project and SessionName are the same on every row of a session (it is replaced as a whole).
        var sql = $"""
            SELECT t.SessionId, MAX(t.SessionName) AS SessionName, t.UserId, u.UserName, t.Project,
                   MIN(t.UsageDate) AS FirstDate, MAX(t.UsageDate) AS LastDate, t.Model AS Models,
                   SUM(t.InputTokens) AS InputTokens,
                   SUM(t.CacheWrite5mTokens) AS CacheWrite5mTokens,
                   SUM(t.CacheWrite1hTokens) AS CacheWrite1hTokens,
                   SUM(t.CacheReadTokens) AS CacheReadTokens,
                   SUM(t.OutputTokens) AS OutputTokens,
                   SUM(t.Cost) AS Cost
            FROM TokenUsage t
            JOIN AppUser u ON u.UserId = t.UserId
            {where}
            GROUP BY t.SessionId, t.UserId, u.UserName, t.Project, t.Model
            """;

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var byModel = await conn.QueryAsync<TokenUsageSessionRow>(sql, p);
        return byModel
            .GroupBy(r => r.SessionId, SqlCollation.Comparer)
            .Select(g => new TokenUsageSessionRow
            {
                SessionId = g.Key,
                SessionName = g.First().SessionName,
                UserId = g.First().UserId,
                UserName = g.First().UserName,
                Project = g.First().Project,
                FirstDate = g.Min(r => r.FirstDate),
                LastDate = g.Max(r => r.LastDate),
                Models = string.Join(", ", g.Select(r => r.Models).Order(SqlCollation.Comparer)),
                InputTokens = g.Sum(r => r.InputTokens),
                CacheWrite5mTokens = g.Sum(r => r.CacheWrite5mTokens),
                CacheWrite1hTokens = g.Sum(r => r.CacheWrite1hTokens),
                CacheReadTokens = g.Sum(r => r.CacheReadTokens),
                OutputTokens = g.Sum(r => r.OutputTokens),
                // Like SQL SUM: unpriced models are ignored, null only when none is priced.
                Cost = g.Any(r => r.Cost.HasValue) ? g.Sum(r => r.Cost) : null,
            })
            .ToList();
    }

    /// <summary>The report filter as a WHERE clause over <c>TokenUsage t</c> (empty when nothing is filtered).</summary>
    private static (string Where, DynamicParameters Parameters) Where(TokenUsageReportFilter filter)
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
        if (!string.IsNullOrWhiteSpace(filter.SessionName))
        {
            where.Add("t.SessionName LIKE @SessionName");
            p.Add("SessionName", $"%{filter.SessionName.Trim()}%");
        }

        return (where.Count > 0 ? "WHERE " + string.Join(" AND ", where) : "", p);
    }

    public async Task<IEnumerable<TokenUsage>> GetByModelAsync(string model)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<TokenUsage>(
            """
            SELECT SessionId, UsageDate, Model, UserId, Project, SessionName,
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
