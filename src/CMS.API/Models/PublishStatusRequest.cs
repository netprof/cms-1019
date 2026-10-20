using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

public class PublishStatusRequest
{
    /// <summary>tinyint key, supplied by the user (not IDENTITY). Locked after creation.</summary>
    public byte Pkid { get; set; }

    [Required, StringLength(50)]
    public string Description { get; set; } = "";

    public bool IsDraft { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDiscontinued { get; set; }
}
