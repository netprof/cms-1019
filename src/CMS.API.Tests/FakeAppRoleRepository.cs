using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Tests;

public class FakeAppRoleRepository : IAppRoleRepository
{
    private readonly List<AppRole> _roles =
    [
        new() { Pkid = 1, RoleId = "Admin", RoleName = "Administrator", PermissionLevel = 1, Description = "系統管理員", UserIds = ["helen", "jenny"] },
        new() { Pkid = 2, RoleId = "User", RoleName = "User", PermissionLevel = 100, Description = "一般使用者", UserIds = ["helen"] },
    ];

    private readonly List<AppUserLookup> _users =
    [
        new() { UserId = "helen", UserName = "Helen" },
        new() { UserId = "jenny", UserName = "Jenny" },
    ];

    private static AppRole Clone(AppRole r, bool withUsers) => new()
    {
        Pkid = r.Pkid, RoleId = r.RoleId, RoleName = r.RoleName,
        PermissionLevel = r.PermissionLevel, Description = r.Description,
        UserCount = r.UserIds.Count,
        UserIds = withUsers ? [.. r.UserIds] : [],
    };

    public Task<IEnumerable<AppRole>> GetAllAsync() =>
        Task.FromResult(_roles.Select(r => Clone(r, false)));

    public Task<IEnumerable<AppRole>> QueryAsync(AppRoleQuery q)
    {
        var result = _roles.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(q.Keyword))
        {
            var k = q.Keyword.Trim();
            result = result.Where(r =>
                r.RoleId.Contains(k, StringComparison.OrdinalIgnoreCase) ||
                r.RoleName.Contains(k, StringComparison.OrdinalIgnoreCase) ||
                (r.Description?.Contains(k, StringComparison.OrdinalIgnoreCase) ?? false));
        }
        if (q.MinPermissionLevel.HasValue) result = result.Where(r => r.PermissionLevel >= q.MinPermissionLevel);
        if (q.MaxPermissionLevel.HasValue) result = result.Where(r => r.PermissionLevel <= q.MaxPermissionLevel);
        return Task.FromResult(result.Select(r => Clone(r, false)).ToList().AsEnumerable());
    }

    public Task<AppRole?> GetByIdAsync(string roleId) =>
        Task.FromResult(_roles.Where(r => r.RoleId == roleId).Select(r => Clone(r, true)).FirstOrDefault());

    public Task<bool> ExistsAsync(string roleId) => Task.FromResult(_roles.Any(r => r.RoleId == roleId));

    public Task<AppRole> CreateAsync(AppRoleRequest request)
    {
        var role = new AppRole
        {
            Pkid = _roles.Max(r => r.Pkid) + 1, RoleId = request.RoleId, RoleName = request.RoleName,
            PermissionLevel = request.PermissionLevel, Description = request.Description,
            UserIds = [.. request.UserIds],
        };
        _roles.Add(role);
        return Task.FromResult(Clone(role, true));
    }

    public Task<AppRole?> UpdateAsync(AppRoleRequest request)
    {
        var role = _roles.FirstOrDefault(r => r.RoleId == request.RoleId);
        if (role is null) return Task.FromResult<AppRole?>(null);
        role.RoleName = request.RoleName;
        role.PermissionLevel = request.PermissionLevel;
        role.Description = request.Description;
        role.UserIds = [.. request.UserIds];
        return Task.FromResult<AppRole?>(Clone(role, true));
    }

    public Task<bool> DeleteAsync(string roleId) => Task.FromResult(_roles.RemoveAll(r => r.RoleId == roleId) > 0);

    public Task<IEnumerable<AppUserLookup>> GetUserLookupsAsync() => Task.FromResult(_users.AsEnumerable());
}
