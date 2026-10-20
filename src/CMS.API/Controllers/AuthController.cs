using System.Security.Cryptography;
using System.Text;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[AllowAnonymous]
[ApiController]
[Route("api/[controller]")]
public class AuthController(IAuthRepository repository, JwtTokenService tokenService) : ControllerBase
{
    private const string InvalidCredentials = "invalid credentials";

    /// <summary>
    /// Checks UserId (exact, case-sensitive), IsActive and SHA-256 password, then returns the
    /// user profile with a 24-hour access token. Every failure is the same generic 401.
    /// </summary>
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request)
    {
        if (string.IsNullOrEmpty(request.UserId) || string.IsNullOrEmpty(request.Password))
            return Unauthorized(new { message = InvalidCredentials });

        var user = await repository.GetCredentialAsync(request.UserId);
        // The DB collation is case-insensitive and ignores trailing spaces; "exact" is checked here.
        if (user is null
            || !string.Equals(user.UserId, request.UserId, StringComparison.Ordinal)
            || !user.IsActive
            || !HashMatches(user.PasswordHash, PasswordHasher.Sha256Hex(request.Password)))
        {
            return Unauthorized(new { message = InvalidCredentials });
        }

        var roleIds = await repository.GetRoleIdsAsync(user.UserId);
        return new LoginResponse
        {
            UserId = user.UserId,
            UserName = user.UserName,
            AccessToken = await tokenService.CreateAccessTokenAsync(user.UserId, user.UserName, roleIds),
        };
    }

    // Stored hashes are lowercase hex; compare in constant time.
    private static bool HashMatches(string stored, string computed) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(stored.Trim().ToLowerInvariant()), Encoding.UTF8.GetBytes(computed));
}
