using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Tests;

public class FakeTokenUsageRepository : ITokenUsageRepository
{
    private readonly List<TokenUsage> _rows = [];

    /// <summary>Lets tests inspect what the controller stored.</summary>
    public IReadOnlyList<TokenUsage> Rows => _rows;

    /// <summary>AppUser names for the report join.</summary>
    private readonly Dictionary<string, string> _userNames = new() { ["helen"] = "Helen Wu", ["jenny"] = "Jenny Lin" };

    /// <summary>Test arrange helper: stores a row as if it had been ingested (and priced).</summary>
    public void Seed(TokenUsage row) => _rows.Add(row);

    /// <summary>The report filter, as the repository's WHERE clause applies it (LIKE is case-insensitive; NULL never matches).</summary>
    private IEnumerable<TokenUsage> Filtered(TokenUsageReportFilter filter)
    {
        static bool Contains(string? value, string? part) =>
            string.IsNullOrWhiteSpace(part) || (value?.Contains(part.Trim(), StringComparison.OrdinalIgnoreCase) ?? false);

        return _rows
            .Where(r => filter.From is null || r.UsageDate >= filter.From)
            .Where(r => filter.To is null || r.UsageDate <= filter.To)
            .Where(r => string.IsNullOrWhiteSpace(filter.UserId) || r.UserId == filter.UserId.Trim())
            .Where(r => Contains(r.Project, filter.Project) && Contains(r.Model, filter.Model))
            .Where(r => Contains(r.SessionName, filter.SessionName));
    }

    public Task<IReadOnlyList<TokenUsageSessionRow>> GetSessionReportRowsAsync(TokenUsageReportFilter filter)
    {
        IReadOnlyList<TokenUsageSessionRow> result = Filtered(filter)
            .GroupBy(r => r.SessionId)
            .Select(g => new TokenUsageSessionRow
            {
                SessionId = g.Key,
                SessionName = g.Max(r => r.SessionName),
                UserId = g.First().UserId,
                UserName = _userNames[g.First().UserId],
                Project = g.First().Project,
                FirstDate = g.Min(r => r.UsageDate),
                LastDate = g.Max(r => r.UsageDate),
                Models = string.Join(", ", g.Select(r => r.Model).Distinct().Order(StringComparer.OrdinalIgnoreCase)),
                InputTokens = g.Sum(r => r.InputTokens),
                CacheWrite5mTokens = g.Sum(r => r.CacheWrite5mTokens),
                CacheWrite1hTokens = g.Sum(r => r.CacheWrite1hTokens),
                CacheReadTokens = g.Sum(r => r.CacheReadTokens),
                OutputTokens = g.Sum(r => r.OutputTokens),
                Cost = g.Any(r => r.Cost.HasValue) ? g.Sum(r => r.Cost) : null,
            })
            .ToList();
        return Task.FromResult(result);
    }

    public Task<IReadOnlyList<TokenUsageReportRow>> GetReportRowsAsync(TokenUsageReportFilter filter)
    {
        IReadOnlyList<TokenUsageReportRow> result = Filtered(filter)
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
        var keptName = _rows.Where(r => r.SessionId == sessionId).Max(r => r.SessionName);
        _rows.RemoveAll(r => r.SessionId == sessionId);
        foreach (var row in rows) row.SessionName ??= keptName;
        _rows.AddRange(rows);
        return Task.CompletedTask;
    }

    public Task<IEnumerable<TokenUsage>> GetByModelAsync(string model) =>
        Task.FromResult<IEnumerable<TokenUsage>>(_rows
            .Where(r => string.Equals(r.Model, model, StringComparison.OrdinalIgnoreCase))
            .Select(Clone).ToList());

    /// <summary>Makes <see cref="UpdateCostsAsync"/> throw, as a failing SQL write would.</summary>
    public bool FailCostUpdates { get; set; }

    public Task UpdateCostsAsync(IReadOnlyList<TokenUsage> rows)
    {
        if (FailCostUpdates) throw new InvalidOperationException("Simulated cost update failure.");
        foreach (var row in rows)
            _rows.Single(r => r.SessionId == row.SessionId && r.UsageDate == row.UsageDate
                && string.Equals(r.Model, row.Model, StringComparison.OrdinalIgnoreCase)).Cost = row.Cost;
        return Task.CompletedTask;
    }

    /// <summary>Copies, like a database read, so callers cannot change stored rows without UpdateCostsAsync.</summary>
    private static TokenUsage Clone(TokenUsage r) => new()
    {
        SessionId = r.SessionId, UsageDate = r.UsageDate, Model = r.Model, UserId = r.UserId, Project = r.Project, SessionName = r.SessionName,
        InputTokens = r.InputTokens, CacheWrite5mTokens = r.CacheWrite5mTokens, CacheWrite1hTokens = r.CacheWrite1hTokens,
        CacheReadTokens = r.CacheReadTokens, OutputTokens = r.OutputTokens, Cost = r.Cost, UpdatedTime = r.UpdatedTime,
    };
}
