using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/partners")]
public class PartnersController(IPartnerRepository repository) : ControllerBase
{
    /// <summary>SQL Server error number for a foreign-key constraint violation.</summary>
    private const int ForeignKeyViolation = 547;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Partner>>> GetAll() =>
        Ok(await repository.GetAllAsync());

    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<Partner>>> Query(PartnerQuery query) =>
        Ok(await repository.QueryAsync(query));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<Partner>> GetById(short id)
    {
        var partner = await repository.GetByIdAsync(id);
        return partner is null ? NotFound() : Ok(partner);
    }

    [HttpPost]
    public async Task<ActionResult<Partner>> Create(PartnerRequest request)
    {
        Normalize(request);
        var created = await repository.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
    }

    [HttpPut]
    public async Task<ActionResult<Partner>> Update(PartnerRequest request)
    {
        Normalize(request);
        var updated = await repository.UpdateAsync(request);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(short id)
    {
        try
        {
            return await repository.DeleteAsync(id) ? NoContent() : NotFound();
        }
        catch (SqlException ex) when (ex.Number == ForeignKeyViolation)
        {
            // Referenced by Course / Certification / PartnerCourseGroup / Promotion2 rows.
            return Conflict(new ProblemDetails
            {
                Title = $"Partner {id} is in use and cannot be deleted.",
            });
        }
    }

    /// <summary>Trims the text fields and stores a blank image filename as NULL.</summary>
    private static void Normalize(PartnerRequest request)
    {
        request.Name = request.Name.Trim();
        request.AppKey = request.AppKey.Trim();
        request.NameOnPartnerMenu = request.NameOnPartnerMenu.Trim();
        request.NameOnCourseDetailPage = request.NameOnCourseDetailPage.Trim();
        request.ImageFilename = string.IsNullOrWhiteSpace(request.ImageFilename)
            ? null
            : request.ImageFilename.Trim();
    }
}
