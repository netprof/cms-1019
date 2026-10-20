using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/tokenusages")]
public class TokenUsagesController(
    ITokenUsageRepository repository, IAppUserRepository users, TokenCostService costService,
    TimeProvider timeProvider) : ControllerBase
{
    /// <summary>Ingests one session's usage, replacing whatever was stored for it.</summary>
    [HttpPost]
    [RequireIngestApiKey]
    public async Task<IActionResult> Ingest(TokenUsageIngestRequest request)
    {
        Normalize(request);
        if (!await users.IsActiveUserAsync(request.UserId))
            ModelState.AddModelError(nameof(request.UserId), $"User '{request.UserId}' does not exist or is inactive.");
        ValidateRows(request.Rows);
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        var now = timeProvider.GetUtcNow().UtcDateTime;
        var rows = request.Rows.Select(r => new TokenUsage
        {
            SessionId = request.SessionId,
            UsageDate = r.Date!.Value,
            Model = r.Model,
            UserId = request.UserId,
            Project = request.Project,
            InputTokens = r.InputTokens,
            CacheWrite5mTokens = r.CacheWrite5mTokens,
            CacheWrite1hTokens = r.CacheWrite1hTokens,
            CacheReadTokens = r.CacheReadTokens,
            OutputTokens = r.OutputTokens,
            UpdatedTime = now,
        }).ToList();

        await costService.PriceAsync(rows);
        await repository.ReplaceSessionAsync(request.SessionId, rows);
        return NoContent();
    }

    /// <summary>Usage summed by (user, date, project, model): one sorted page plus totals for the filtered set.</summary>
    [HttpPost("report")]
    public async Task<ActionResult<TokenUsageReport>> Report(TokenUsageReportQuery query)
    {
        if (query.From > query.To)
            ModelState.AddModelError(nameof(query.To), "To must not be earlier than From.");
        if (!ReportSortKeys.TryGetValue(query.SortField, out var sortKey))
            ModelState.AddModelError(nameof(query.SortField), $"Cannot sort by '{query.SortField}'.");
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        // Aggregated rows are few (users x days x projects x models), so sort and page in memory,
        // as the other list pages do client-side.
        var rows = await repository.GetReportRowsAsync(query);
        var ordered = query.SortOrder == 1 ? rows.OrderBy(sortKey!) : rows.OrderByDescending(sortKey!);
        var page = ordered
            .ThenByDescending(r => r.UsageDate)
            .ThenBy(r => r.UserId, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.Project, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.Model, StringComparer.OrdinalIgnoreCase)
            .Skip(query.First)
            .Take(query.Rows)
            .ToList();

        return Ok(new TokenUsageReport
        {
            Items = page,
            TotalRecords = rows.Count,
            Totals = new TokenUsageReportTotals
            {
                InputTokens = rows.Sum(r => r.InputTokens),
                CacheWrite5mTokens = rows.Sum(r => r.CacheWrite5mTokens),
                CacheWrite1hTokens = rows.Sum(r => r.CacheWrite1hTokens),
                CacheReadTokens = rows.Sum(r => r.CacheReadTokens),
                OutputTokens = rows.Sum(r => r.OutputTokens),
                Cost = rows.Any(r => r.Cost.HasValue) ? rows.Sum(r => r.Cost) : null,
            },
        });
    }

    /// <summary>Sortable report columns by their JSON (camelCase) name; text compares case-insensitively like SQL Server.</summary>
    private static readonly Dictionary<string, Func<TokenUsageReportRow, object?>> ReportSortKeys =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["usageDate"] = r => r.UsageDate,
            ["userId"] = r => r.UserId.ToUpperInvariant(),
            ["userName"] = r => r.UserName.ToUpperInvariant(),
            ["project"] = r => r.Project.ToUpperInvariant(),
            ["model"] = r => r.Model.ToUpperInvariant(),
            ["inputTokens"] = r => r.InputTokens,
            ["cacheWrite5mTokens"] = r => r.CacheWrite5mTokens,
            ["cacheWrite1hTokens"] = r => r.CacheWrite1hTokens,
            ["cacheReadTokens"] = r => r.CacheReadTokens,
            ["outputTokens"] = r => r.OutputTokens,
            ["tokenIn"] = r => r.TokenIn,
            ["cost"] = r => r.Cost,
        };

    /// <summary>Taipei is a fixed UTC+8 (no DST); the server itself has no time-zone handling.</summary>
    private static readonly TimeSpan TaipeiOffset = TimeSpan.FromHours(8);

    /// <summary>Trims text so it matches how SQL Server compares keys (trailing spaces ignored).</summary>
    private static void Normalize(TokenUsageIngestRequest request)
    {
        request.SessionId = request.SessionId.Trim();
        request.UserId = request.UserId.Trim();
        request.Project = request.Project.Trim();
        foreach (var row in request.Rows) row.Model = row.Model.Trim();
    }

    private void ValidateRows(List<TokenUsageIngestRow> rows)
    {
        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().ToOffset(TaipeiOffset).DateTime);

        for (var i = 0; i < rows.Count; i++)
        {
            if (rows[i].Date > today)
                ModelState.AddModelError($"Rows[{i}].Date", $"Date {rows[i].Date:yyyy-MM-dd} is later than today in Taipei ({today:yyyy-MM-dd}).");
        }

        // (date, model) is part of the primary key; SQL Server's default collation is case-insensitive.
        var duplicates = rows
            .GroupBy(r => (r.Date, Model: r.Model.ToUpperInvariant()))
            .Where(g => g.Count() > 1)
            .Select(g => $"{g.Key.Date:yyyy-MM-dd} / {g.First().Model}");
        foreach (var duplicate in duplicates)
            ModelState.AddModelError(nameof(TokenUsageIngestRequest.Rows), $"Duplicate row for (date, model) {duplicate}.");
    }
}
