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

    public Task ReplaceSessionAsync(string sessionId, IReadOnlyList<TokenUsage> rows)
    {
        _rows.RemoveAll(r => r.SessionId == sessionId);
        _rows.AddRange(rows);
        return Task.CompletedTask;
    }
}
