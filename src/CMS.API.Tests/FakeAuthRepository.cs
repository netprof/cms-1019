using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;

namespace CMS.API.Tests;

/// <summary>Pass a null <c>signingKey</c> to simulate a missing <c>appConfig.symmetricSecurityKey</c>.</summary>
public class FakeAuthRepository(string? signingKey = FakeAuthRepository.SigningKey) : IAuthRepository
{
    public const string Password = "Secret#1";
    public const string SigningKey = "test-signing-key-at-least-32-bytes!!";

    private readonly List<LoginCredential> _users =
    [
        new() { UserId = "helen", UserName = "Helen", IsActive = true, PasswordHash = PasswordHasher.Sha256Hex(Password) },
        new() { UserId = "jenny", UserName = "Jenny", IsActive = false, PasswordHash = PasswordHasher.Sha256Hex(Password) },
    ];

    private readonly Dictionary<string, string[]> _roles = new()
    {
        ["helen"] = ["Admin", "User"],
        ["jenny"] = ["User"],
    };

    // Mirrors the case-insensitive DB collation, so the controller's exact-match check is exercised.
    public Task<LoginCredential?> GetCredentialAsync(string userId) =>
        Task.FromResult(Find(userId));

    public Task<IReadOnlyList<string>> GetRoleIdsAsync(string userId) =>
        Task.FromResult<IReadOnlyList<string>>(_roles.GetValueOrDefault(userId) ?? []);

    public Task<bool> UpdateUserNameAsync(string userId, string userName)
    {
        var user = Find(userId);
        if (user is not null) user.UserName = userName;
        return Task.FromResult(user is not null);
    }

    private readonly Dictionary<string, DateTime> _passwordUpdatedTimes = new(StringComparer.OrdinalIgnoreCase);

    public Task<bool> UpdatePasswordAsync(string userId, string passwordHash, DateTime updatedTime)
    {
        var user = Find(userId);
        if (user is null) return Task.FromResult(false);
        user.PasswordHash = passwordHash;
        _passwordUpdatedTimes[user.UserId] = updatedTime;
        return Task.FromResult(true);
    }

    /// <summary>Lets tests inspect what the controller stored.</summary>
    public string? UserName(string userId) => Find(userId)?.UserName;

    public string? StoredHash(string userId) => Find(userId)?.PasswordHash;

    /// <returns>Null until a password change stamps it.</returns>
    public DateTime? PasswordUpdatedTime(string userId) =>
        _passwordUpdatedTimes.TryGetValue(userId, out var time) ? time : null;

    private LoginCredential? Find(string userId) =>
        _users.FirstOrDefault(u => string.Equals(u.UserId, userId, StringComparison.OrdinalIgnoreCase));

    public Task<string> GetJwtSigningKeyAsync() => signingKey is null
        ? throw new InvalidOperationException("SysConfig 'appConfig' has no symmetricSecurityKey.")
        : Task.FromResult(signingKey);
}
