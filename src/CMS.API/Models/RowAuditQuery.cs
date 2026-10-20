using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>The combined history of several records of one table.</summary>
public class RowAuditQuery
{
    [Required, MaxLength(50)] public string TableName { get; set; } = "";

    /// <summary>Keys as stored in RowAudit. Capped so the SQL <c>IN</c> list stays small (a week page has ≤ 21).</summary>
    [MaxLength(RowAuditQueryLimits.MaxPkids)] public List<string> Pkids { get; set; } = [];
}

public static class RowAuditQueryLimits
{
    public const int MaxPkids = 200;
}
