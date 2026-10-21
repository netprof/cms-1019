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
