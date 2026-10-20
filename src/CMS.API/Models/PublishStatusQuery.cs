namespace CMS.API.Models;

public class PublishStatusQuery
{
    /// <summary>Matches Description (contains).</summary>
    public string? Keyword { get; set; }

    /// <summary>Tri-state: null = no filter.</summary>
    public bool? IsDraft { get; set; }
    public bool? IsPublished { get; set; }
    public bool? IsDiscontinued { get; set; }
}
