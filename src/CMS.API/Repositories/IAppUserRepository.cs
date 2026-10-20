using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IAppUserRepository
{
    Task<IEnumerable<AppUser>> GetAllAsync();
    Task<IEnumerable<AppUser>> QueryAsync(AppUserQuery query);
    Task<AppUser?> GetByIdAsync(string userId);
    Task<bool> ExistsAsync(string userId);

    /// <param name="passwordHash">Hash to store; computed by the caller from the default password.</param>
    Task<AppUser> CreateAsync(AppUserRequest request, string passwordHash);

    /// <summary>Updates UserName, IsActive and roles. Never touches PasswordHash.</summary>
    /// <returns>The updated record, or null if the user does not exist.</returns>
    Task<AppUser?> UpdateAsync(AppUserRequest request);

    /// <summary>Replaces PasswordHash and stamps PasswordUpdatedTime.</summary>
    /// <returns>The updated record, or null if the user does not exist.</returns>
    Task<AppUser?> ResetPasswordAsync(string userId, string passwordHash);

    /// <returns>False if the user does not exist.</returns>
    Task<bool> DeleteAsync(string userId);

    /// <summary>Reads <c>defaultPassword</c> from the SysConfig <c>appConfig</c> JSON.</summary>
    /// <exception cref="InvalidOperationException">The row or property is missing.</exception>
    Task<string> GetDefaultPasswordAsync();

    Task<IEnumerable<AppRoleLookup>> GetRoleLookupsAsync();
}
