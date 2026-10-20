using CMS.API.Models;

namespace CMS.API.Repositories;

/// <summary>Reads <c>RowAudit</c>; rows are written by <see cref="Services.RowAuditWriter"/>.</summary>
public interface IRowAuditRepository
{
    /// <summary>
    /// The history of one record, newest first. <paramref name="primaryKeyValues"/> is matched
    /// exactly as the writer stored it: the pkid, or <c>Model,yyyy-MM-dd</c> for ModelPrice.
    /// </summary>
    Task<IEnumerable<RowAuditRecord>> GetByRecordAsync(string tableName, string primaryKeyValues);

    /// <summary>The combined history of several records of one table, newest first.</summary>
    Task<IEnumerable<RowAuditKeyedRecord>> GetByRecordsAsync(string tableName, IReadOnlyCollection<string> primaryKeyValues);
}
