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

/// <summary>The report crossed by two dimensions: every measure per cell, plus row, column and grand totals.</summary>
public class TokenUsagePivot
{
    /// <summary>Ordered by key; the client re-sorts by the chosen measure.</summary>
    public List<TokenUsagePivotRow> Rows { get; set; } = [];

    /// <summary>Ordered by key (dates ascending); empty when there is no column dimension.</summary>
    public List<TokenUsagePivotColumn> Columns { get; set; } = [];

    public TokenUsageReportTotals Total { get; set; } = new();
}

/// <summary>One value of a pivot axis.</summary>
public class TokenUsagePivotHeader
{
    /// <summary>Identifies the value: UserId, project, model or the date label.</summary>
    public string Key { get; set; } = "";

    /// <summary>Shown text: the user's name for a user, else the key.</summary>
    public string Label { get; set; } = "";

    /// <summary>Tooltip: the UserId for a user, a week's Monday ~ Sunday; otherwise null.</summary>
    public string? Title { get; set; }
}

public class TokenUsagePivotColumn : TokenUsagePivotHeader
{
    public TokenUsageReportTotals Total { get; set; } = new();
}

public class TokenUsagePivotRow : TokenUsagePivotHeader
{
    /// <summary>Cells by column key; a column without data has no entry.</summary>
    public Dictionary<string, TokenUsageReportTotals> Cells { get; set; } = [];

    public TokenUsageReportTotals Total { get; set; } = new();
}
