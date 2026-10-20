using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Tests;

public class FakeAppUserRepository : IAppUserRepository
{
    public const string DefaultPassword = "Secret#1";

    private sealed class Row
    {
        public AppUser User { get; init; } = new();
        public string PasswordHash { get; set; } = "";
    }

    private readonly List<Row> _rows =
    [
        new()
        {
            User = new()
            {
                Pkid = 1, UserId = "helen", UserName = "Helen", IsActive = true,
                PasswordUpdatedTime = new DateTime(2026, 1, 10, 8, 0, 0, DateTimeKind.Utc),
                RoleIds = ["Admin", "User"],
            },
            PasswordHash = "seed-hash-helen",
        },
        new()
        {
            User = new()
            {
                Pkid = 2, UserId = "jenny", UserName = "Jenny", IsActive = false,
                PasswordUpdatedTime = new DateTime(2026, 3, 5, 9, 30, 0, DateTimeKind.Utc),
                RoleIds = ["User"],
            },
            PasswordHash = "seed-hash-jenny",
        },
    ];

    private readonly List<AppRoleLookup> _roles =
    [
        new() { RoleId = "Admin", RoleName = "Administrator" },
        new() { RoleId = "User", RoleName = "User" },
    ];

    /// <summary>Lets tests inspect what the controller stored.</summary>
    public string? StoredHash(string userId) => Find(userId)?.PasswordHash;

    private Row? Find(string userId) => _rows.FirstOrDefault(r => r.User.UserId == userId);

    private static AppUser Clone(AppUser u, bool withRoles) => new()
    {
        Pkid = u.Pkid, UserId = u.UserId, UserName = u.UserName, IsActive = u.IsActive,
        PasswordUpdatedTime = u.PasswordUpdatedTime,
        RoleCount = u.RoleIds.Count,
        RoleIds = withRoles ? [.. u.RoleIds] : [],
    };

    private IEnumerable<AppUser> Ordered(IEnumerable<Row> rows) =>
        rows.Select(r => r.User).OrderBy(u => u.UserId, StringComparer.Ordinal);

    public Task<IEnumerable<AppUser>> GetAllAsync() =>
        Task.FromResult(Ordered(_rows).Select(u => Clone(u, false)).ToList().AsEnumerable());

    public Task<IEnumerable<AppUser>> QueryAsync(AppUserQuery q)
    {
        var result = _rows.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(q.Keyword))
        {
            var k = q.Keyword.Trim();
            result = result.Where(r =>
                r.User.UserId.Contains(k, StringComparison.OrdinalIgnoreCase) ||
                r.User.UserName.Contains(k, StringComparison.OrdinalIgnoreCase));
        }
        if (q.IsActive.HasValue) result = result.Where(r => r.User.IsActive == q.IsActive.Value);
        if (!string.IsNullOrWhiteSpace(q.RoleId)) result = result.Where(r => r.User.RoleIds.Contains(q.RoleId.Trim()));
        if (q.PasswordUpdatedFrom.HasValue)
        {
            var from = q.PasswordUpdatedFrom.Value.ToDateTime(TimeOnly.MinValue);
            result = result.Where(r => r.User.PasswordUpdatedTime >= from);
        }
        if (q.PasswordUpdatedTo.HasValue)
        {
            var toExclusive = q.PasswordUpdatedTo.Value.AddDays(1).ToDateTime(TimeOnly.MinValue);
            result = result.Where(r => r.User.PasswordUpdatedTime < toExclusive);
        }
        return Task.FromResult(Ordered(result).Select(u => Clone(u, false)).ToList().AsEnumerable());
    }

    public Task<AppUser?> GetByIdAsync(string userId)
    {
        var row = Find(userId);
        return Task.FromResult(row is null ? null : Clone(row.User, true));
    }

    public Task<bool> ExistsAsync(string userId) => Task.FromResult(Find(userId) is not null);

    public Task<AppUser> CreateAsync(AppUserRequest request, string passwordHash)
    {
        var user = new AppUser
        {
            Pkid = _rows.Max(r => r.User.Pkid) + 1,
            UserId = request.UserId, UserName = request.UserName, IsActive = request.IsActive,
            PasswordUpdatedTime = DateTime.UtcNow,
            RoleIds = [.. request.RoleIds],
        };
        _rows.Add(new Row { User = user, PasswordHash = passwordHash });
        return Task.FromResult(Clone(user, true));
    }

    public Task<AppUser?> UpdateAsync(AppUserRequest request)
    {
        var row = Find(request.UserId);
        if (row is null) return Task.FromResult<AppUser?>(null);
        row.User.UserName = request.UserName;
        row.User.IsActive = request.IsActive;
        row.User.RoleIds = [.. request.RoleIds];
        // PasswordHash / PasswordUpdatedTime untouched, as in the real repository.
        return Task.FromResult<AppUser?>(Clone(row.User, true));
    }

    public Task<AppUser?> ResetPasswordAsync(string userId, string passwordHash)
    {
        var row = Find(userId);
        if (row is null) return Task.FromResult<AppUser?>(null);
        row.PasswordHash = passwordHash;
        row.User.PasswordUpdatedTime = DateTime.UtcNow;
        return Task.FromResult<AppUser?>(Clone(row.User, true));
    }

    public Task<bool> DeleteAsync(string userId) => Task.FromResult(_rows.RemoveAll(r => r.User.UserId == userId) > 0);

    public Task<string> GetDefaultPasswordAsync() => Task.FromResult(DefaultPassword);

    public Task<IEnumerable<AppRoleLookup>> GetRoleLookupsAsync() => Task.FromResult(_roles.AsEnumerable());
}
