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
        Task.FromResult(_users.FirstOrDefault(u => string.Equals(u.UserId, userId, StringComparison.OrdinalIgnoreCase)));

    public Task<IReadOnlyList<string>> GetRoleIdsAsync(string userId) =>
        Task.FromResult<IReadOnlyList<string>>(_roles.GetValueOrDefault(userId) ?? []);

    public Task<string> GetJwtSigningKeyAsync() => signingKey is null
        ? throw new InvalidOperationException("SysConfig 'appConfig' has no symmetricSecurityKey.")
        : Task.FromResult(signingKey);
}
