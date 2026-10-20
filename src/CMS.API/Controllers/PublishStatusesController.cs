using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/publishstatuses")]
public class PublishStatusesController(IPublishStatusRepository repository) : ControllerBase
{
    /// <summary>SQL Server error number for a foreign-key constraint violation.</summary>
    private const int ForeignKeyViolation = 547;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<PublishStatus>>> GetAll() =>
        Ok(await repository.GetAllAsync());

    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<PublishStatus>>> Query(PublishStatusQuery query) =>
        Ok(await repository.QueryAsync(query));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<PublishStatus>> GetById(byte id)
    {
        var status = await repository.GetByIdAsync(id);
        return status is null ? NotFound() : Ok(status);
    }

    [HttpPost]
    public async Task<ActionResult<PublishStatus>> Create(PublishStatusRequest request)
    {
        request.Description = request.Description.Trim();
        if (await repository.ExistsAsync(request.Pkid))
            return Conflict(new ProblemDetails { Title = $"Publish status {request.Pkid} already exists." });

        var created = await repository.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
    }

    [HttpPut]
    public async Task<ActionResult<PublishStatus>> Update(PublishStatusRequest request)
    {
        request.Description = request.Description.Trim();
        var updated = await repository.UpdateAsync(request);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(byte id)
    {
        try
        {
            return await repository.DeleteAsync(id) ? NoContent() : NotFound();
        }
        catch (SqlException ex) when (ex.Number == ForeignKeyViolation)
        {
            // Referenced by Course / Promotion2 rows.
            return Conflict(new ProblemDetails
            {
                Title = $"Publish status {id} is in use and cannot be deleted.",
            });
        }
    }
}
