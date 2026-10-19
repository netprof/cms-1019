using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

public class PartnerRequest
{
    /// <summary>smallint IDENTITY key. Ignored on create; identifies the row on update.</summary>
    public short Pkid { get; set; }

    [Required, StringLength(50)]
    public string Name { get; set; } = "";

    [Required, StringLength(10)]
    public string AppKey { get; set; } = "";

    [Required, StringLength(200)]
    public string NameOnPartnerMenu { get; set; } = "";

    [Required, StringLength(50)]
    public string NameOnCourseDetailPage { get; set; } = "";

    public int DisplayOrder { get; set; }

    [StringLength(50)]
    public string? ImageFilename { get; set; }
}
