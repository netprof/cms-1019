using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/featuredpromoitems")]
public class FeaturedPromoItemsController(IFeaturedPromoItemRepository repository) : ControllerBase
{
    /// <summary>SQL Server error numbers for a unique-index / unique-constraint violation.</summary>
    private static readonly int[] UniqueViolations = [2601, 2627];

    /// <summary>SQL Server error number for a foreign-key constraint violation.</summary>
    private const int ForeignKeyViolation = 547;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<FeaturedPromoItem>>> GetAll() =>
        Ok(await repository.GetAllAsync());

    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<FeaturedPromoItem>>> Query(FeaturedPromoItemQuery query)
    {
        if (query.WeekOf is { } day)
        {
            // Monday–Sunday week containing `day`.
            var monday = day.AddDays(-(((int)day.DayOfWeek + 6) % 7));
            query.ScheduleOnFrom = monday;
            query.ScheduleOnTo = monday.AddDays(6);
        }
        if (query.ScheduleOnFrom > query.ScheduleOnTo)
        {
            ModelState.AddModelError(nameof(query.ScheduleOnTo), "ScheduleOnTo must be on or after ScheduleOnFrom.");
            return ValidationProblem(ModelState);
        }
        return Ok(await repository.QueryAsync(query));
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<FeaturedPromoItem>> GetById(int id)
    {
        var item = await repository.GetByIdAsync(id);
        return item is null ? NotFound() : Ok(item);
    }

    [HttpPost]
    public async Task<ActionResult<FeaturedPromoItem>> Create(FeaturedPromoItemRequest request)
    {
        Normalize(request);
        if (await SlotTakenAsync(request, excludePkid: 0)) return SlotConflict(request);

        try
        {
            var created = await repository.CreateAsync(request);
            return CreatedAtAction(nameof(GetById), new { id = created.Pkid }, created);
        }
        catch (SqlException ex) when (UniqueViolations.Contains(ex.Number))
        {
            return SlotConflict(request);
        }
        catch (SqlException ex) when (ex.Number == ForeignKeyViolation)
        {
            return BadFk();
        }
    }

    [HttpPut]
    public async Task<ActionResult<FeaturedPromoItem>> Update(FeaturedPromoItemRequest request)
    {
        Normalize(request);
        if (await SlotTakenAsync(request, excludePkid: request.Pkid)) return SlotConflict(request);

        try
        {
            var updated = await repository.UpdateAsync(request);
            return updated is null ? NotFound() : Ok(updated);
        }
        catch (SqlException ex) when (UniqueViolations.Contains(ex.Number))
        {
            return SlotConflict(request);
        }
        catch (SqlException ex) when (ex.Number == ForeignKeyViolation)
        {
            return BadFk();
        }
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id) =>
        await repository.DeleteAsync(id) ? NoContent() : NotFound();

    /// <summary>Moves the item one slot down (1 → 2), swapping with the item already there.</summary>
    [HttpPost("{id:int}/move-down")]
    public Task<IActionResult> MoveDown(int id) => MoveAsync(id, +1);

    /// <summary>Moves the item one slot up (2 → 1), swapping with the item already there.</summary>
    [HttpPost("{id:int}/move-up")]
    public Task<IActionResult> MoveUp(int id) => MoveAsync(id, -1);

    private async Task<IActionResult> MoveAsync(int id, int delta)
    {
        var item = await repository.GetByIdAsync(id);
        if (item is null) return NotFound();

        var toSlot = item.Slot + delta;
        if (toSlot is < FeaturedPromoItemSlots.First or > FeaturedPromoItemSlots.Last)
        {
            return BadRequest(new ProblemDetails
            {
                Title = $"Slot {item.Slot} cannot move {(delta > 0 ? "down" : "up")}.",
            });
        }

        await repository.MoveAsync(item, (byte)toSlot);
        return NoContent();
    }

    private Task<bool> SlotTakenAsync(FeaturedPromoItemRequest r, int excludePkid) =>
        repository.IsSlotTakenAsync(r.ScheduleOn, r.TrainingCenterPkid, r.Slot, excludePkid);

    private ConflictObjectResult SlotConflict(FeaturedPromoItemRequest r) => Conflict(new ProblemDetails
    {
        Title = $"Slot {r.Slot} on {r.ScheduleOn:yyyy-MM-dd} for training center {r.TrainingCenterPkid} is already taken.",
    });

    private BadRequestObjectResult BadFk() => BadRequest(new ProblemDetails
    {
        Title = "The promotion or training center does not exist.",
    });

    private static void Normalize(FeaturedPromoItemRequest request)
    {
        request.Topic = request.Topic.Trim();
        request.Description = request.Description.Trim();
    }
}
