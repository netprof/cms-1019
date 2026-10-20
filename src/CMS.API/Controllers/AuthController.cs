using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.JsonWebTokens;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(
    IAuthRepository repository, JwtTokenService tokenService, TimeProvider timeProvider) : ControllerBase
{
    private const string InvalidCredentials = "invalid credentials";

    /// <summary>Exact <c>AppRole.RoleId</c> carried in the token's <c>role</c> claim.</summary>
    public const string AdminRole = "Admin";

    /// <summary>
    /// Checks UserId (exact, case-sensitive), IsActive and SHA-256 password, then returns the
    /// user profile with a 24-hour access token. Every failure is the same generic 401.
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
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

    /// <summary>
    /// Updates the signed-in user's UserName (trimmed). The UserId is the token's <c>sub</c>, never
    /// the body; UserId, roles and IsActive cannot change here. The token's <c>name</c> claim keeps
    /// the old value until the next login.
    /// </summary>
    [HttpPut("profile")]
    public async Task<ActionResult<UserProfile>> UpdateProfile(UpdateProfileRequest request)
    {
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var userName = request.UserName.Trim();
        if (!await repository.UpdateUserNameAsync(userId, userName)) return NotFound();

        return new UserProfile { UserId = userId, UserName = userName };
    }

    /// <summary>
    /// Changes the signed-in user's password (UserId from the token's <c>sub</c>). Every failed rule
    /// is a 400 ValidationProblem keyed by field, and nothing is written: <c>currentPassword</c> when
    /// its SHA-256 does not match the stored hash, <c>newPassword</c> when it breaks
    /// <see cref="PasswordPolicy"/>, <c>confirmPassword</c> when it differs from the new one. A wrong
    /// current password is deliberately not 401, which the client treats as an expired session.
    /// On success stores SHA-256(new) and stamps PasswordUpdatedTime; 204, no body.
    /// </summary>
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(ChangePasswordRequest request)
    {
        var userId = User.FindFirstValue(JwtRegisteredClaimNames.Sub);
        if (string.IsNullOrEmpty(userId)) return Unauthorized();

        var user = await repository.GetCredentialAsync(userId);
        if (user is null) return NotFound();

        if (!HashMatches(user.PasswordHash, PasswordHasher.Sha256Hex(request.CurrentPassword)))
            ModelState.AddModelError(nameof(request.CurrentPassword), "目前密碼不正確 (Current password is incorrect.)");
        if (!PasswordPolicy.IsSatisfiedBy(request.NewPassword))
            ModelState.AddModelError(nameof(request.NewPassword), PasswordPolicy.Message);
        if (request.ConfirmPassword != request.NewPassword)
            ModelState.AddModelError(nameof(request.ConfirmPassword), "新密碼與確認密碼不一致 (New password and confirmation do not match.)");
        if (!ModelState.IsValid) return ValidationProblem(ModelState);

        await repository.UpdatePasswordAsync(
            user.UserId, PasswordHasher.Sha256Hex(request.NewPassword), timeProvider.GetUtcNow().UtcDateTime);
        return NoContent();
    }

    /// <summary>
    /// Admin only (role claim <c>Admin</c>; others get 403): resets the target user's password to
    /// SysConfig <c>appConfig.defaultPassword</c>, read on each call, and stamps PasswordUpdatedTime.
    /// Only the target UserId comes in; 204 with no body, 404 for an unknown user.
    /// </summary>
    [HttpPost("reset-password")]
    [Authorize(Roles = AdminRole)]
    public async Task<IActionResult> ResetPassword(
        ResetPasswordRequest request, [FromServices] IAppUserRepository appUsers)
    {
        var hash = PasswordHasher.Sha256Hex(await appUsers.GetDefaultPasswordAsync());
        var found = await repository.UpdatePasswordAsync(
            request.UserId.Trim(), hash, timeProvider.GetUtcNow().UtcDateTime);
        return found ? NoContent() : NotFound();
    }

    // Stored hashes are lowercase hex; compare in constant time.
    private static bool HashMatches(string stored, string computed) =>
        CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(stored.Trim().ToLowerInvariant()), Encoding.UTF8.GetBytes(computed));
}
