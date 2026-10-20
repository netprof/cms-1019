using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/rowaudit")]
public class RowAuditController(IRowAuditRepository repository) : ControllerBase
{
    /// <summary>
    /// The audit history of one record, newest first; empty when it has none.
    /// <paramref name="pkid"/> is a string so composite keys (ModelPrice: <c>Model,yyyy-MM-dd</c>) fit.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<RowAuditRecord>>> GetByRecord(string? tableName, string? pkid)
    {
        if (string.IsNullOrWhiteSpace(tableName) || string.IsNullOrWhiteSpace(pkid))
            return BadRequest(new ProblemDetails { Title = "tableName and pkid are required." });

        return Ok(await repository.GetByRecordAsync(tableName.Trim(), pkid.Trim()));
    }

    /// <summary>
    /// The combined history of several records of one table, newest first, each row carrying its
    /// <c>primaryKeyValues</c>. An empty <c>pkids</c> list gives an empty result.
    /// </summary>
    [HttpPost("query")]
    public async Task<ActionResult<IEnumerable<RowAuditKeyedRecord>>> Query(RowAuditQuery query)
    {
        var keys = query.Pkids.Where(k => !string.IsNullOrWhiteSpace(k)).Select(k => k.Trim()).Distinct().ToList();
        return Ok(await repository.GetByRecordsAsync(query.TableName.Trim(), keys));
    }
}
