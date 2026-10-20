namespace CMS.API.Models;

/// <summary>One <c>RowAudit</c> row (pkid is IDENTITY, so it is not part of the insert).</summary>
public class RowAuditEntry
{
    public string TableName { get; set; } = "";
    public string UserName { get; set; } = "";
    public string PrimaryKeyValues { get; set; } = "";
    public string ActionType { get; set; } = "";
    public string? ActionDesc { get; set; }
    public DateTime DateTime { get; set; }
}
