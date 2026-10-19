using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/approles")]
public class AppRolesController(IAppRoleRepository repository) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IEnumerable<AppRole>>> GetAll() =>
        Ok(await repository.GetAllAsync());

    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<AppRole>>> Query(AppRoleQuery query) =>
        Ok(await repository.QueryAsync(query));

    [HttpGet("{id}")]
    public async Task<ActionResult<AppRole>> GetById(string id)
    {
        var role = await repository.GetByIdAsync(id);
        return role is null ? NotFound() : Ok(role);
    }

    [HttpPost]
    public async Task<ActionResult<AppRole>> Create(AppRoleRequest request)
    {
        request.RoleId = request.RoleId.Trim();
        if (await repository.ExistsAsync(request.RoleId))
            return Conflict(new ProblemDetails { Title = $"Role '{request.RoleId}' already exists." });

        var created = await repository.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = created.RoleId }, created);
    }

    [HttpPut]
    public async Task<ActionResult<AppRole>> Update(AppRoleRequest request)
    {
        var updated = await repository.UpdateAsync(request);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id) =>
        await repository.DeleteAsync(id) ? NoContent() : NotFound();
}
