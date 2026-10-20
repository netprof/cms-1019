using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Tests;

/// <summary>In-memory <c>RowAudit</c>; rows are kept in insertion order (their pkid order).</summary>
public class FakeRowAuditRepository : IRowAuditRepository
{
    public List<RowAuditEntry> Rows { get; } = [];

    public Task<IEnumerable<RowAuditRecord>> GetByRecordAsync(string tableName, string primaryKeyValues) =>
        Task.FromResult(Rows
            .Select((r, index) => (Row: r, Pkid: index))
            .Where(x => x.Row.TableName == tableName && x.Row.PrimaryKeyValues == primaryKeyValues)
            .OrderByDescending(x => x.Row.DateTime).ThenByDescending(x => x.Pkid)
            .Select(x => new RowAuditRecord
            {
                DateTime = x.Row.DateTime, UserName = x.Row.UserName,
                ActionType = x.Row.ActionType, ActionDesc = x.Row.ActionDesc,
            })
            .ToList().AsEnumerable());

    public Task<IEnumerable<RowAuditKeyedRecord>> GetByRecordsAsync(
        string tableName, IReadOnlyCollection<string> primaryKeyValues) =>
        Task.FromResult(Rows
            .Select((r, index) => (Row: r, Pkid: index))
            .Where(x => x.Row.TableName == tableName && primaryKeyValues.Contains(x.Row.PrimaryKeyValues))
            .OrderByDescending(x => x.Row.DateTime).ThenByDescending(x => x.Pkid)
            .Select(x => new RowAuditKeyedRecord
            {
                DateTime = x.Row.DateTime, UserName = x.Row.UserName, ActionType = x.Row.ActionType,
                ActionDesc = x.Row.ActionDesc, PrimaryKeyValues = x.Row.PrimaryKeyValues,
            })
            .ToList().AsEnumerable());
}
