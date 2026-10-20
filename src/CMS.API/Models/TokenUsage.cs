namespace CMS.API.Models;

/// <summary>One stored row: a session's usage of one model on one Taipei date.</summary>
public class TokenUsage
{
    public string SessionId { get; set; } = "";
    public DateOnly UsageDate { get; set; }
    public string Model { get; set; } = "";
    public string UserId { get; set; } = "";
    public string Project { get; set; } = "";
    public long InputTokens { get; set; }
    public long CacheWrite5mTokens { get; set; }
    public long CacheWrite1hTokens { get; set; }
    public long CacheReadTokens { get; set; }
    public long OutputTokens { get; set; }

    /// <summary>USD; null when no model price applies.</summary>
    public decimal? Cost { get; set; }

    /// <summary>UTC.</summary>
    public DateTime UpdatedTime { get; set; }
}
