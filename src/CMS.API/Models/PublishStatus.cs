namespace CMS.API.Models;

public class PublishStatus
{
    /// <summary>tinyint key, supplied by the user (not IDENTITY).</summary>
    public byte Pkid { get; set; }
    public string Description { get; set; } = "";
    public bool IsDraft { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDiscontinued { get; set; }
}
