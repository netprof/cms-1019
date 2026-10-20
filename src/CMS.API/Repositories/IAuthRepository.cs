using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IAuthRepository
{
    /// <returns>The user's credential row, or null if <paramref name="userId"/> does not exist.</returns>
    Task<LoginCredential?> GetCredentialAsync(string userId);

    /// <returns>Every RoleId assigned to the user in AppUserRole.</returns>
    Task<IReadOnlyList<string>> GetRoleIdsAsync(string userId);

    /// <summary>Reads <c>symmetricSecurityKey</c> from the SysConfig <c>appConfig</c> JSON.</summary>
    /// <exception cref="InvalidOperationException">The row or property is missing.</exception>
    Task<string> GetJwtSigningKeyAsync();
}
