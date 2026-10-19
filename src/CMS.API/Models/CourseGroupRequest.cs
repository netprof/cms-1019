using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

public class CourseGroupRequest
{
    /// <summary>smallint IDENTITY key. Ignored on create; identifies the row on update.</summary>
    public short Pkid { get; set; }

    [Required, StringLength(100)]
    public string Description { get; set; } = "";
}
