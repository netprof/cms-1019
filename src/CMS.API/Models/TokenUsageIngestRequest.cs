using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// One Claude Code session's token usage, posted by the SessionEnd hook.
/// Replaces every stored row of the session; an empty <see cref="Rows"/> clears it.
/// </summary>
public class TokenUsageIngestRequest
{
    [Required, StringLength(100)]
    public string SessionId { get; set; } = "";

    [Required, StringLength(200)]
    public string UserId { get; set; } = "";

    [Required, StringLength(200)]
    public string Project { get; set; } = "";

    /// <summary>Optional; when null or blank the session keeps the name already stored for it.</summary>
    [StringLength(200)]
    public string? SessionName { get; set; }

    [Required]
    public List<TokenUsageIngestRow> Rows { get; set; } = new();
}

public class TokenUsageIngestRow
{
    /// <summary>Usage date in Taipei time (UTC+8).</summary>
    [Required]
    public DateOnly? Date { get; set; }

    [Required, StringLength(100)]
    public string Model { get; set; } = "";

    [Range(0, long.MaxValue)]
    public long InputTokens { get; set; }

    [Range(0, long.MaxValue)]
    public long CacheWrite5mTokens { get; set; }

    [Range(0, long.MaxValue)]
    public long CacheWrite1hTokens { get; set; }

    [Range(0, long.MaxValue)]
    public long CacheReadTokens { get; set; }

    [Range(0, long.MaxValue)]
    public long OutputTokens { get; set; }
}
