using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Tests;

public class FakeTokenUsageRepository : ITokenUsageRepository
{
    public const string ApiKey = "test-ingest-key";

    private readonly List<TokenUsage> _rows = [];

    /// <summary>Lets tests inspect what the controller stored.</summary>
    public IReadOnlyList<TokenUsage> Rows => _rows;

    /// <summary>AppUser stand-in: helen is active, jenny is inactive.</summary>
    private readonly Dictionary<string, bool> _users = new() { ["helen"] = true, ["jenny"] = false };

    public Task<string> GetIngestApiKeyAsync() => Task.FromResult(ApiKey);

    public Task<bool> IsActiveUserAsync(string userId) =>
        Task.FromResult(_users.TryGetValue(userId, out var active) && active);

    /// <summary>AppUser names for the report join.</summary>
    private readonly Dictionary<string, string> _userNames = new() { ["helen"] = "Helen Wu", ["jenny"] = "Jenny Lin" };

    /// <summary>Test arrange helper: stores a row as if it had been ingested (and priced).</summary>
    public void Seed(TokenUsage row) => _rows.Add(row);

    public Task<IReadOnlyList<TokenUsageReportRow>> GetReportRowsAsync(TokenUsageReportFilter filter)
    {
        static bool Contains(string value, string? part) =>
            string.IsNullOrWhiteSpace(part) || value.Contains(part.Trim(), StringComparison.OrdinalIgnoreCase);

        IReadOnlyList<TokenUsageReportRow> result = _rows
            .Where(r => filter.From is null || r.UsageDate >= filter.From)
            .Where(r => filter.To is null || r.UsageDate <= filter.To)
            .Where(r => string.IsNullOrWhiteSpace(filter.UserId) || r.UserId == filter.UserId.Trim())
            .Where(r => Contains(r.Project, filter.Project) && Contains(r.Model, filter.Model))
            .GroupBy(r => (r.UserId, r.UsageDate, r.Project, r.Model))
            .Select(g => new TokenUsageReportRow
            {
                UserId = g.Key.UserId,
                UserName = _userNames[g.Key.UserId],
                UsageDate = g.Key.UsageDate,
                Project = g.Key.Project,
                Model = g.Key.Model,
                InputTokens = g.Sum(r => r.InputTokens),
                CacheWrite5mTokens = g.Sum(r => r.CacheWrite5mTokens),
                CacheWrite1hTokens = g.Sum(r => r.CacheWrite1hTokens),
                CacheReadTokens = g.Sum(r => r.CacheReadTokens),
                OutputTokens = g.Sum(r => r.OutputTokens),
                Cost = g.Any(r => r.Cost.HasValue) ? g.Sum(r => r.Cost) : null, // SQL SUM ignores NULLs
            })
            .ToList();
        return Task.FromResult(result);
    }

    public Task ReplaceSessionAsync(string sessionId, IReadOnlyList<TokenUsage> rows)
    {
        _rows.RemoveAll(r => r.SessionId == sessionId);
        _rows.AddRange(rows);
        return Task.CompletedTask;
    }

    public Task<IEnumerable<TokenUsage>> GetByModelAsync(string model) =>
        Task.FromResult<IEnumerable<TokenUsage>>(_rows
            .Where(r => string.Equals(r.Model, model, StringComparison.OrdinalIgnoreCase))
            .Select(Clone).ToList());

    public Task UpdateCostsAsync(IReadOnlyList<TokenUsage> rows)
    {
        foreach (var row in rows)
            _rows.Single(r => r.SessionId == row.SessionId && r.UsageDate == row.UsageDate
                && string.Equals(r.Model, row.Model, StringComparison.OrdinalIgnoreCase)).Cost = row.Cost;
        return Task.CompletedTask;
    }

    /// <summary>Copies, like a database read, so callers cannot change stored rows without UpdateCostsAsync.</summary>
    private static TokenUsage Clone(TokenUsage r) => new()
    {
        SessionId = r.SessionId, UsageDate = r.UsageDate, Model = r.Model, UserId = r.UserId, Project = r.Project,
        InputTokens = r.InputTokens, CacheWrite5mTokens = r.CacheWrite5mTokens, CacheWrite1hTokens = r.CacheWrite1hTokens,
        CacheReadTokens = r.CacheReadTokens, OutputTokens = r.OutputTokens, Cost = r.Cost, UpdatedTime = r.UpdatedTime,
    };
}
