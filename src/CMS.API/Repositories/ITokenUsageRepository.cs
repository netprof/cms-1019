using CMS.API.Models;

namespace CMS.API.Repositories;

public interface ITokenUsageRepository
{
    /// <summary>
    /// In one transaction, deletes every row of <paramref name="sessionId"/> and inserts <paramref name="rows"/>.
    /// </summary>
    Task ReplaceSessionAsync(string sessionId, IReadOnlyList<TokenUsage> rows);

    /// <summary>
    /// Filtered usage summed by (UserId, UsageDate, Project, Model), with the user's name from AppUser.
    /// Unordered and unpaged; the controller sorts, pages and totals.
    /// </summary>
    Task<IReadOnlyList<TokenUsageReportRow>> GetReportRowsAsync(TokenUsageReportFilter filter);

    /// <summary>Every row for <paramref name="model"/> (all sessions and dates), for cost recompute.</summary>
    Task<IEnumerable<TokenUsage>> GetByModelAsync(string model);

    /// <summary>Writes each row's <c>Cost</c> back by its key (SessionId, UsageDate, Model), in one transaction.</summary>
    Task UpdateCostsAsync(IReadOnlyList<TokenUsage> rows);
}
