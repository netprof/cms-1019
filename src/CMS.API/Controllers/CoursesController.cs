using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/courses")]
public class CoursesController(ICourseRepository repository) : ControllerBase
{
    /// <summary>SQL Server error number for a foreign-key constraint violation.</summary>
    private const int ForeignKeyViolation = 547;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Course>>> GetAll() =>
        Ok(await repository.GetAllAsync());

    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<Course>>> Query(CourseQuery query) =>
        Ok(await repository.QueryAsync(query));

    [HttpGet("{id:int}")]
    public async Task<ActionResult<Course>> GetById(int id)
    {
        var course = await repository.GetByIdAsync(id);
        return course is null ? NotFound() : Ok(course);
    }

    [HttpPost]
    public async Task<ActionResult<Course>> Create(CourseRequest request)
    {
        Normalize(request);
        if (!ValidateDates(request)) return ValidationProblem(ModelState);

        var created = await repository.CreateAsync(request);
        return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
    }

    [HttpPut]
    public async Task<ActionResult<Course>> Update(CourseRequest request)
    {
        Normalize(request);
        if (!ValidateDates(request)) return ValidationProblem(ModelState);

        var updated = await repository.UpdateAsync(request);
        return updated is null ? NotFound() : Ok(updated);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            return await repository.DeleteAsync(id) ? NoContent() : NotFound();
        }
        catch (SqlException ex) when (ex.Number == ForeignKeyViolation)
        {
            // Referenced by CourseFAQ / CourseRelatedLink / HotCourse rows.
            return Conflict(new ProblemDetails
            {
                Title = $"Course {id} is in use and cannot be deleted.",
            });
        }
    }

    private bool ValidateDates(CourseRequest request)
    {
        if (request.ScheduleOff < request.ScheduleOn)
        {
            ModelState.AddModelError(nameof(request.ScheduleOff), "ScheduleOff must be on or after ScheduleOn.");
            return false;
        }
        return true;
    }

    /// <summary>Trims text, stores blank optional text as NULL and de-duplicates link ids.</summary>
    private static void Normalize(CourseRequest request)
    {
        request.Title = request.Title.Trim();
        request.CourseId = request.CourseId.Trim();
        request.ProdCourseId = request.ProdCourseId.Trim();
        request.FriendlyUrl = request.FriendlyUrl.Trim();
        request.OfficialTitle = Optional(request.OfficialTitle);
        request.Material = Optional(request.Material);
        request.Objective = Optional(request.Objective);
        request.Target = Optional(request.Target);
        request.Prerequisites = Optional(request.Prerequisites);
        request.Outline = Optional(request.Outline);
        request.TowardCertOrExam = Optional(request.TowardCertOrExam);
        request.Note = Optional(request.Note);
        request.OtherInfo = Optional(request.OtherInfo);
        request.CertificationPkids = request.CertificationPkids.Distinct().ToList();
        request.JobCategoryPkids = request.JobCategoryPkids.Distinct().ToList();
    }

    private static string? Optional(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
