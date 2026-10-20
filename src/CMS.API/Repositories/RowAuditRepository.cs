using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public class RowAuditRepository(IDbConnectionFactory connectionFactory) : IRowAuditRepository
{
    public async Task<IEnumerable<RowAuditRecord>> GetByRecordAsync(string tableName, string primaryKeyValues)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        // pkid breaks ties between changes written in the same instant (datetime is ~3 ms).
        return await conn.QueryAsync<RowAuditRecord>(
            """
            SELECT a.[DateTime], a.UserName, a.ActionType, a.ActionDesc
            FROM RowAudit a
            WHERE a.TableName = @tableName AND a.PrimaryKeyValues = @primaryKeyValues
            ORDER BY a.[DateTime] DESC, a.pkid DESC
            """,
            new
            {
                tableName = new DbString { Value = tableName, IsAnsi = true, Length = 50 },
                primaryKeyValues = new DbString { Value = primaryKeyValues, Length = 100 },
            });
    }

    public async Task<IEnumerable<RowAuditKeyedRecord>> GetByRecordsAsync(
        string tableName, IReadOnlyCollection<string> primaryKeyValues)
    {
        if (primaryKeyValues.Count == 0) return [];

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        // Dapper expands the list into IN (@keys1, @keys2, …).
        return await conn.QueryAsync<RowAuditKeyedRecord>(
            """
            SELECT a.[DateTime], a.UserName, a.ActionType, a.ActionDesc, a.PrimaryKeyValues
            FROM RowAudit a
            WHERE a.TableName = @tableName AND a.PrimaryKeyValues IN @keys
            ORDER BY a.[DateTime] DESC, a.pkid DESC
            """,
            new { tableName = new DbString { Value = tableName, IsAnsi = true, Length = 50 }, keys = primaryKeyValues });
    }
}
