using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/appusers")]
public class AppUsersController(IAppUserRepository repository) : ControllerBase
{
    /// <summary>SQL Server error number for a foreign-key constraint violation.</summary>
    private const int ForeignKeyViolation = 547;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<AppUser>>> GetAll() =>
        Ok(await repository.GetAllAsync());

    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<AppUser>>> Query(AppUserQuery query) =>
        Ok(await repository.QueryAsync(query));

    [HttpGet("{id}")]
    public async Task<ActionResult<AppUser>> GetById(string id)
    {
        var user = await repository.GetByIdAsync(id);
        return user is null ? NotFound() : Ok(user);
    }

    [HttpPost]
    public async Task<ActionResult<AppUser>> Create(AppUserRequest request)
    {
        Normalize(request);
        if (await repository.ExistsAsync(request.UserId))
            return Conflict(new ProblemDetails { Title = $"User '{request.UserId}' already exists." });

        // Initial password is the system default from SysConfig; never taken from the client.
        var hash = await DefaultPasswordHashAsync();
        var created = await repository.CreateAsync(request, hash);
        return CreatedAtAction(nameof(GetById), new { id = created.UserId }, created);
    }

    [HttpPut]
    public async Task<ActionResult<AppUser>> Update(AppUserRequest request)
    {
        Normalize(request);
        var updated = await repository.UpdateAsync(request);
        return updated is null ? NotFound() : Ok(updated);
    }

    /// <summary>Resets the password to the system default (SysConfig appConfig.defaultPassword).</summary>
    [HttpPost("{id}/reset-password")]
    public async Task<ActionResult<AppUser>> ResetPassword(string id)
    {
        var hash = await DefaultPasswordHashAsync();
        var updated = await repository.ResetPasswordAsync(id, hash);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        try
        {
            return await repository.DeleteAsync(id) ? NoContent() : NotFound();
        }
        catch (SqlException ex) when (ex.Number == ForeignKeyViolation)
        {
            return Conflict(new ProblemDetails
            {
                Title = $"User '{id}' is in use and cannot be deleted.",
            });
        }
    }

    private async Task<string> DefaultPasswordHashAsync() =>
        PasswordHasher.Sha256Hex(await repository.GetDefaultPasswordAsync());

    /// <summary>Trims identifying text and de-duplicates role ids.</summary>
    private static void Normalize(AppUserRequest request)
    {
        request.UserId = request.UserId.Trim();
        request.UserName = request.UserName.Trim();
        request.RoleIds = request.RoleIds
            .Select(r => r.Trim())
            .Where(r => r.Length > 0)
            .Distinct()
            .ToList();
    }
}
