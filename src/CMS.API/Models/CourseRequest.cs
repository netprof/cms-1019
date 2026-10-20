using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

public class CourseRequest
{
    /// <summary>int IDENTITY key. Ignored on create; identifies the row on update.</summary>
    public int Pkid { get; set; }

    [Required, StringLength(200)]
    public string Title { get; set; } = "";

    [StringLength(300)]
    public string? OfficialTitle { get; set; }

    [Required, StringLength(50)]
    public string CourseId { get; set; } = "";

    [Required, StringLength(50)]
    public string ProdCourseId { get; set; } = "";

    [Required, StringLength(100)]
    public string FriendlyUrl { get; set; } = "";

    public int DisplayOrder { get; set; }

    [Range(1, short.MaxValue)]
    public short PartnerPkid { get; set; }

    public short? CourseGroupPkid { get; set; }

    [Range(1, byte.MaxValue)]
    public byte PublishStatusPkid { get; set; }

    public DateOnly ScheduleOn { get; set; }

    /// <summary>Must be on or after <see cref="ScheduleOn"/> (checked by the controller).</summary>
    public DateOnly ScheduleOff { get; set; }

    [Range(0, short.MaxValue)]
    public short Hour { get; set; }

    [Range(0, 999_999_999)]
    public decimal ListPrice { get; set; }

    [Range(0, 99_999_999.9)]
    public decimal LearningCredit { get; set; }

    [StringLength(500)]
    public string? Material { get; set; }

    [StringLength(4000)]
    public string? Objective { get; set; }

    [StringLength(500)]
    public string? Target { get; set; }

    [StringLength(4000)]
    public string? Prerequisites { get; set; }

    public string? Outline { get; set; }

    public string? TowardCertOrExam { get; set; }

    [StringLength(4000)]
    public string? Note { get; set; }

    [StringLength(4000)]
    public string? OtherInfo { get; set; }

    public bool CanRepeat { get; set; }

    public List<int> CertificationPkids { get; set; } = new();

    public List<short> JobCategoryPkids { get; set; } = new();
}
