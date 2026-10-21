namespace CMS.API.Models;

/// <summary>One page of a token usage report plus totals for the whole filtered set.</summary>
public class TokenUsageReport<TRow> where TRow : TokenUsageReportTotals
{
    public List<TRow> Items { get; set; } = [];

    /// <summary>Row count of the whole filtered set (before paging).</summary>
    public int TotalRecords { get; set; }

    public TokenUsageReportTotals Totals { get; set; } = new();
}

/// <summary>The report summed by (user, date, project, model).</summary>
public class TokenUsageReport : TokenUsageReport<TokenUsageReportRow>;

/// <summary>The report summed by session.</summary>
public class TokenUsageSessionReport : TokenUsageReport<TokenUsageSessionRow>;

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

/// <summary>One session's filtered usage, summed over its dates and models.</summary>
public class TokenUsageSessionRow : TokenUsageReportTotals
{
    public string SessionId { get; set; } = "";
    public string? SessionName { get; set; }
    public string UserId { get; set; } = "";
    public string UserName { get; set; } = "";
    public string Project { get; set; } = "";

    /// <summary>Earliest UsageDate in the filtered rows.</summary>
    public DateOnly FirstDate { get; set; }

    /// <summary>Latest UsageDate in the filtered rows.</summary>
    public DateOnly LastDate { get; set; }

    /// <summary>Distinct models, sorted, joined with ", ".</summary>
    public string Models { get; set; } = "";
}
