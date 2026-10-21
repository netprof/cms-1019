using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Filters for the token usage report (all optional; null = no filter).</summary>
public class TokenUsageReportFilter
{
    /// <summary>UsageDate on or after this date (inclusive).</summary>
    public DateOnly? From { get; set; }

    /// <summary>UsageDate on or before this date (inclusive).</summary>
    public DateOnly? To { get; set; }

    /// <summary>Exact UserId.</summary>
    public string? UserId { get; set; }

    /// <summary>Project contains this text.</summary>
    public string? Project { get; set; }

    /// <summary>Model contains this text.</summary>
    public string? Model { get; set; }

    /// <summary>SessionName contains this text (unnamed sessions never match).</summary>
    public string? SessionName { get; set; }
}

/// <summary>Report request: filters plus the p-table paging/sorting state.</summary>
public class TokenUsageReportQuery : TokenUsageReportFilter
{
    /// <summary>Zero-based index of the first row on the page.</summary>
    [Range(0, int.MaxValue)]
    public int First { get; set; }

    /// <summary>Page size.</summary>
    [Range(1, 500)]
    public int Rows { get; set; } = 20;

    /// <summary>camelCase report column name (see <c>TokenUsagesController</c> sort keys).</summary>
    public string SortField { get; set; } = "usageDate";

    /// <summary>1 = ascending, -1 = descending (PrimeNG convention).</summary>
    [AllowedValues(1, -1)]
    public int SortOrder { get; set; } = -1;
}

/// <summary>Session report request: the same filters and paging, newest session first by default.</summary>
public class TokenUsageSessionReportQuery : TokenUsageReportQuery
{
    public TokenUsageSessionReportQuery() => SortField = "lastDate";
}

/// <summary>Pivot request: the report filters plus the two axes (dimensions are user, project, model, date).</summary>
public class TokenUsagePivotQuery : TokenUsageReportFilter
{
    /// <summary>Dimension of the rows.</summary>
    public string RowDim { get; set; } = "user";

    /// <summary>Dimension of the columns; null = no columns (each row has only its total).</summary>
    public string? ColDim { get; set; } = "date";

    /// <summary>day, week (ISO, Monday start) or month; required only when an axis is date.</summary>
    public string? DateGrain { get; set; } = "month";
}
