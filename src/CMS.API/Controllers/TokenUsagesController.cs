using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/tokenusages")]
public class TokenUsagesController(
    ITokenUsageRepository repository, IAppUserRepository users, TokenCostService costService,
    TimeProvider timeProvider) : ControllerBase
{
    /// <summary>Ingests one session's usage, replacing whatever was stored for it.</summary>
    /// <remarks>Called by the SessionEnd hook, which has no JWT: the API key stands in for bearer auth.</remarks>
    [HttpPost]
    [AllowAnonymous]
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
            SessionName = request.SessionName,
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
        if (!ValidateReportQuery(query, ReportSorts, out var sort)) return ValidationProblem(ModelState);

        var rows = await repository.GetReportRowsAsync(query);
        return Ok(BuildReport<TokenUsageReport, TokenUsageReportRow>(rows, query, sort, sorted => sorted
            .ThenByDescending(r => r.UsageDate)
            .ThenBy(r => r.UserId, SqlCollation.Comparer)
            .ThenBy(r => r.Project, SqlCollation.Comparer)
            .ThenBy(r => r.Model, SqlCollation.Comparer)));
    }

    /// <summary>Usage summed by session (filters apply to the rows before summing): one sorted page plus totals.</summary>
    [HttpPost("report/sessions")]
    public async Task<ActionResult<TokenUsageSessionReport>> SessionReport(TokenUsageSessionReportQuery query)
    {
        if (!ValidateReportQuery(query, SessionSorts, out var sort)) return ValidationProblem(ModelState);

        var rows = await repository.GetSessionReportRowsAsync(query);
        return Ok(BuildReport<TokenUsageSessionReport, TokenUsageSessionRow>(rows, query, sort, sorted => sorted
            .ThenByDescending(r => r.LastDate)
            .ThenBy(r => r.SessionId, SqlCollation.Comparer)));
    }

    private bool ValidateReportQuery<TRow>(
        TokenUsageReportQuery query, Dictionary<string, ReportSort<TRow>> sorts, out ReportSort<TRow> sort)
    {
        if (query.From > query.To)
            ModelState.AddModelError(nameof(query.To), "To must not be earlier than From.");
        if (!sorts.TryGetValue(query.SortField, out sort!))
            ModelState.AddModelError(nameof(query.SortField), $"Cannot sort by '{query.SortField}'.");
        return ModelState.IsValid;
    }

    private static TReport BuildReport<TReport, TRow>(
        IReadOnlyList<TRow> rows, TokenUsageReportQuery query, ReportSort<TRow> sort,
        Func<IOrderedEnumerable<TRow>, IOrderedEnumerable<TRow>> thenBy)
        where TReport : TokenUsageReport<TRow>, new()
        where TRow : TokenUsageReportTotals
    {
        // Aggregated rows are few (users x days x projects x models, or sessions), so sort and page
        // in memory, as the other list pages do client-side.
        var page = thenBy(sort(rows, query.SortOrder == 1))
            .Skip(query.First)
            .Take(query.Rows)
            .ToList();

        return new TReport
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
        };
    }

    private delegate IOrderedEnumerable<TRow> ReportSort<TRow>(IEnumerable<TRow> rows, bool ascending);

    /// <summary>Sort builders for one row type, so the key type is inferred from the lambda.</summary>
    private static class Sorts<TRow> where TRow : TokenUsageReportTotals
    {
        public static ReportSort<TRow> By<TKey>(Func<TRow, TKey> key, IComparer<TKey>? comparer = null) =>
            (rows, ascending) => ascending ? rows.OrderBy(key, comparer) : rows.OrderByDescending(key, comparer);

        public static ReportSort<TRow> ByText(Func<TRow, string?> key) => By(key, SqlCollation.Comparer);

        /// <summary>A report's sortable columns by JSON (camelCase) name: <paramref name="columns"/> plus the token sums.</summary>
        public static Dictionary<string, ReportSort<TRow>> With(Dictionary<string, ReportSort<TRow>> columns)
        {
            columns["inputTokens"] = By(r => r.InputTokens);
            columns["cacheWrite5mTokens"] = By(r => r.CacheWrite5mTokens);
            columns["cacheWrite1hTokens"] = By(r => r.CacheWrite1hTokens);
            columns["cacheReadTokens"] = By(r => r.CacheReadTokens);
            columns["outputTokens"] = By(r => r.OutputTokens);
            columns["tokenIn"] = By(r => r.TokenIn);
            columns["cost"] = By(r => r.Cost);
            return columns;
        }
    }

    private static readonly Dictionary<string, ReportSort<TokenUsageReportRow>> ReportSorts =
        Sorts<TokenUsageReportRow>.With(new(StringComparer.OrdinalIgnoreCase)
        {
            ["usageDate"] = Sorts<TokenUsageReportRow>.By(r => r.UsageDate),
            ["userId"] = Sorts<TokenUsageReportRow>.ByText(r => r.UserId),
            ["userName"] = Sorts<TokenUsageReportRow>.ByText(r => r.UserName),
            ["project"] = Sorts<TokenUsageReportRow>.ByText(r => r.Project),
            ["model"] = Sorts<TokenUsageReportRow>.ByText(r => r.Model),
        });

    private static readonly Dictionary<string, ReportSort<TokenUsageSessionRow>> SessionSorts =
        Sorts<TokenUsageSessionRow>.With(new(StringComparer.OrdinalIgnoreCase)
        {
            ["sessionName"] = Sorts<TokenUsageSessionRow>.ByText(r => r.SessionName),
            ["sessionId"] = Sorts<TokenUsageSessionRow>.ByText(r => r.SessionId),
            ["userId"] = Sorts<TokenUsageSessionRow>.ByText(r => r.UserId),
            ["userName"] = Sorts<TokenUsageSessionRow>.ByText(r => r.UserName),
            ["project"] = Sorts<TokenUsageSessionRow>.ByText(r => r.Project),
            ["firstDate"] = Sorts<TokenUsageSessionRow>.By(r => r.FirstDate),
            ["lastDate"] = Sorts<TokenUsageSessionRow>.By(r => r.LastDate),
            ["models"] = Sorts<TokenUsageSessionRow>.ByText(r => r.Models),
        });

    /// <summary>Taipei is a fixed UTC+8 (no DST); the server itself has no time-zone handling.</summary>
    private static readonly TimeSpan TaipeiOffset = TimeSpan.FromHours(8);

    /// <summary>Trims text so it matches how SQL Server compares keys (trailing spaces ignored); a blank name is no name.</summary>
    private static void Normalize(TokenUsageIngestRequest request)
    {
        request.SessionId = request.SessionId.Trim();
        request.UserId = request.UserId.Trim();
        request.Project = request.Project.Trim();
        request.SessionName = string.IsNullOrWhiteSpace(request.SessionName) ? null : request.SessionName.Trim();
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

        // (date, model) is part of the primary key, so models compare as SQL Server does.
        var duplicates = rows
            .GroupBy(r => r.Date)
            .SelectMany(byDate => byDate.GroupBy(r => r.Model, SqlCollation.Comparer))
            .Where(g => g.Count() > 1)
            .Select(g => $"{g.First().Date:yyyy-MM-dd} / {g.First().Model}");
        foreach (var duplicate in duplicates)
            ModelState.AddModelError(nameof(TokenUsageIngestRequest.Rows), $"Duplicate row for (date, model) {duplicate}.");
    }
}
