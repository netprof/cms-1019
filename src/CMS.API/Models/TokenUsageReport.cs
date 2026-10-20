namespace CMS.API.Models;

/// <summary>One page of the token usage report plus totals for the whole filtered set.</summary>
public class TokenUsageReport
{
    public List<TokenUsageReportRow> Items { get; set; } = [];

    /// <summary>Row count of the whole filtered set (before paging).</summary>
    public int TotalRecords { get; set; }

    public TokenUsageReportTotals Totals { get; set; } = new();
}

/// <summary>Token sums shared by a report row and the totals row.</summary>
public class TokenUsageReportTotals
{
    public long InputTokens { get; set; }
    public long CacheWrite5mTokens { get; set; }
    public long CacheWrite1hTokens { get; set; }
    public long CacheReadTokens { get; set; }
    public long OutputTokens { get; set; }

    /// <summary>Everything sent to the model: input + both cache writes + cache read.</summary>
    public long TokenIn => InputTokens + CacheWrite5mTokens + CacheWrite1hTokens + CacheReadTokens;

    /// <summary>USD; null when none of the summed rows has a cost.</summary>
    public decimal? Cost { get; set; }
}

/// <summary>Usage aggregated by (UserId, UsageDate, Project, Model).</summary>
public class TokenUsageReportRow : TokenUsageReportTotals
{
    public DateOnly UsageDate { get; set; }
    public string UserId { get; set; } = "";
    public string UserName { get; set; } = "";
    public string Project { get; set; } = "";
    public string Model { get; set; } = "";
}
