using System.Text;
using CMS.API.Repositories;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace CMS.API.Services;

/// <summary>
/// Issues HS256 access tokens signed with the SysConfig <c>appConfig.symmetricSecurityKey</c>
/// (read on every call, so a rotated key takes effect without a restart).
/// </summary>
public class JwtTokenService(IAuthRepository repository, TimeProvider timeProvider)
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(24);

    /// <summary>Claims: <c>sub</c> = UserId, <c>name</c> = UserName, one <c>role</c> per RoleId.</summary>
    public async Task<string> CreateAccessTokenAsync(string userId, string userName, IEnumerable<string> roleIds)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(await repository.GetJwtSigningKeyAsync()));
        var now = timeProvider.GetUtcNow().UtcDateTime;

        var descriptor = new SecurityTokenDescriptor
        {
            Claims = new Dictionary<string, object>
            {
                [JwtRegisteredClaimNames.Sub] = userId,
                [JwtRegisteredClaimNames.Name] = userName,
                ["role"] = roleIds.ToArray(),
            },
            IssuedAt = now,
            NotBefore = now,
            Expires = now + Lifetime,
            SigningCredentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256),
        };
        return new JsonWebTokenHandler().CreateToken(descriptor);
    }
}
