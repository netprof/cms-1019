using CMS.API.Models;

namespace CMS.API.Repositories;

public interface ITokenUsageRepository
{
    /// <summary>Reads <c>apiKey</c> from the SysConfig <c>tokenUsageConfig</c> JSON.</summary>
    /// <exception cref="InvalidOperationException">The row or property is missing.</exception>
    Task<string> GetIngestApiKeyAsync();

    /// <returns>True if <paramref name="userId"/> exists in AppUser with IsActive = 1.</returns>
    Task<bool> IsActiveUserAsync(string userId);

    /// <summary>
    /// In one transaction, deletes every row of <paramref name="sessionId"/> and inserts <paramref name="rows"/>.
    /// </summary>
    Task ReplaceSessionAsync(string sessionId, IReadOnlyList<TokenUsage> rows);
}
