using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IAppRoleRepository
{
    Task<IEnumerable<AppRole>> GetAllAsync();
    Task<IEnumerable<AppRole>> QueryAsync(AppRoleQuery query);
    Task<AppRole?> GetByIdAsync(string roleId);
    Task<bool> ExistsAsync(string roleId);
    Task<AppRole> CreateAsync(AppRoleRequest request);

    /// <returns>The updated record, or null if the role does not exist.</returns>
    Task<AppRole?> UpdateAsync(AppRoleRequest request);

    /// <returns>False if the role does not exist.</returns>
    Task<bool> DeleteAsync(string roleId);
    Task<IEnumerable<AppUserLookup>> GetUserLookupsAsync();
}
