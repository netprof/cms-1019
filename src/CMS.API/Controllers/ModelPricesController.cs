using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;

namespace CMS.API.Controllers;

/// <summary>
/// Claude model price list. Composite key (Model, EffectiveDate): routes are
/// <c>/api/modelprices/{model}/{effectiveDate:yyyy-MM-dd}</c>.
/// Create, update and delete recompute the cost of that model's TokenUsage rows, in the same
/// transaction as the price write, so a failed recompute leaves the price unchanged.
/// </summary>
[ApiController]
[Route("api/modelprices")]
public class ModelPricesController(IModelPriceRepository repository, TokenCostService costService) : ControllerBase
{
    /// <summary>SQL Server error number for a PRIMARY KEY violation.</summary>
    private const int PrimaryKeyViolation = 2627;

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ModelPrice>>> GetAll() =>
        Ok(await repository.GetAllAsync());

    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<ModelPrice>>> Query(ModelPriceQuery query) =>
        Ok(await repository.QueryAsync(query));

    [HttpGet("{model}/{effectiveDate}")]
    public async Task<ActionResult<ModelPrice>> GetById(string model, DateOnly effectiveDate)
    {
        var price = await repository.GetByIdAsync(model, effectiveDate);
        return price is null ? NotFound() : Ok(price);
    }

    [HttpPost]
    public async Task<ActionResult<ModelPrice>> Create(ModelPriceRequest request)
    {
        request.Model = request.Model.Trim();
        if (request.Model.Length == 0)
            return ValidationProblem(new ValidationProblemDetails(
                new Dictionary<string, string[]> { ["Model"] = ["The Model field is required."] }));

        if (await repository.ExistsAsync(request.Model, request.EffectiveDate))
            return DuplicateConflict(request);

        try
        {
            using var scope = DbTransactionScope.Begin();
            var created = await repository.CreateAsync(request);
            await costService.RecomputeModelAsync(created.Model);
            scope.Complete();
            return CreatedAtAction(nameof(GetById),
                new { model = created.Model, effectiveDate = created.EffectiveDate.ToString("yyyy-MM-dd") }, created);
        }
        catch (SqlException ex) when (ex.Number == PrimaryKeyViolation)
        {
            return DuplicateConflict(request);
        }
    }

    [HttpPut]
    public async Task<ActionResult<ModelPrice>> Update(ModelPriceRequest request)
    {
        request.Model = request.Model.Trim();
        using var scope = DbTransactionScope.Begin();
        var updated = await repository.UpdateAsync(request);
        if (updated is null) return NotFound();

        await costService.RecomputeModelAsync(updated.Model);
        scope.Complete();
        return Ok(updated);
    }

    [HttpDelete("{model}/{effectiveDate}")]
    public async Task<IActionResult> Delete(string model, DateOnly effectiveDate)
    {
        using var scope = DbTransactionScope.Begin();
        if (!await repository.DeleteAsync(model, effectiveDate)) return NotFound();

        await costService.RecomputeModelAsync(model);
        scope.Complete();
        return NoContent();
    }

    private ConflictObjectResult DuplicateConflict(ModelPriceRequest request) =>
        Conflict(new ProblemDetails
        {
            Title = $"A price for {request.Model} effective {request.EffectiveDate:yyyy-MM-dd} already exists.",
        });
}
