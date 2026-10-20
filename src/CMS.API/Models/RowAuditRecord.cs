namespace CMS.API.Models;

/// <summary>One change in a record's audit history (<c>GET /api/rowaudit</c>).</summary>
public class RowAuditRecord
{
    /// <summary>UTC, serialized without an offset (the Angular side appends <c>Z</c>).</summary>
    public DateTime DateTime { get; set; }
    public string UserName { get; set; } = "";
    public string ActionType { get; set; } = "";
    public string? ActionDesc { get; set; }
}

/// <summary>A history row of one of several records (<c>POST /api/rowaudit/query</c>).</summary>
public class RowAuditKeyedRecord : RowAuditRecord
{
    public string PrimaryKeyValues { get; set; } = "";
}
