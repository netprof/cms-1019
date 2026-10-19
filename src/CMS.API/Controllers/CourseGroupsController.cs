using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/coursegroups")]
public class CourseGroupsController(ICourseGroupRepository repository) : ControllerBase
{
    /// <summary>SQL Server error number for a foreign-key constraint violation.</summary>
    private const int ForeignKeyViolation = 547;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<CourseGroup>>> GetAll() =>
        Ok(await repository.GetAllAsync());

    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<CourseGroup>>> Query(CourseGroupQuery query) =>
        Ok(await repository.QueryAsync(query));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<CourseGroup>> GetById(short id)
    {
        var group = await repository.GetByIdAsync(id);
        return group is null ? NotFound() : Ok(group);
    }

    [HttpPost]
    public async Task<ActionResult<CourseGroup>> Create(CourseGroupRequest request)
    {
        Normalize(request);
        var created = await repository.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
    }

    [HttpPut]
    public async Task<ActionResult<CourseGroup>> Update(CourseGroupRequest request)
    {
        Normalize(request);
        var updated = await repository.UpdateAsync(request);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(short id)
    {
        // FK_Course_CourseGroup is ON DELETE CASCADE: deleting a group that still has
        // courses would silently delete them. Refuse up front instead of relying on SQL.
        if (await repository.IsInUseAsync(id))
            return InUse(id);

        try
        {
            return await repository.DeleteAsync(id) ? NoContent() : NotFound();
        }
        catch (SqlException ex) when (ex.Number == ForeignKeyViolation)
        {
            // PartnerCourseGroup FK (no cascade), or a row added between the check and the delete.
            return InUse(id);
        }
    }

    private ConflictObjectResult InUse(short id) =>
        Conflict(new ProblemDetails
        {
            Title = $"CourseGroup {id} is in use and cannot be deleted.",
        });

    /// <summary>Trims the description.</summary>
    private static void Normalize(CourseGroupRequest request)
    {
        request.Description = request.Description.Trim();
    }
}
