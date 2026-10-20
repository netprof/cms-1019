using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/tokenusages")]
public class TokenUsagesController(ITokenUsageRepository repository, TimeProvider timeProvider) : ControllerBase
{
    /// <summary>Ingests one session's usage, replacing whatever was stored for it.</summary>
    [HttpPost]
    [RequireIngestApiKey]
    public async Task<IActionResult> Ingest(TokenUsageIngestRequest request)
    {
        Normalize(request);
        if (!await repository.IsActiveUserAsync(request.UserId))
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
            Cost = null, // pricing is not applied yet
            UpdatedTime = now,
        }).ToList();

        await repository.ReplaceSessionAsync(request.SessionId, rows);
        return NoContent();
    }

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
