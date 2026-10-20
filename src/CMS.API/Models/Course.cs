namespace CMS.API.Models;

public class Course
{
    public int Pkid { get; set; }
    public string Title { get; set; } = "";
    public string? OfficialTitle { get; set; }
    public string CourseId { get; set; } = "";
    public string ProdCourseId { get; set; } = "";
    public string FriendlyUrl { get; set; } = "";
    public int DisplayOrder { get; set; }
    public short PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    public byte PublishStatusPkid { get; set; }
    public DateOnly ScheduleOn { get; set; }
    public DateOnly ScheduleOff { get; set; }
    public short Hour { get; set; }
    public decimal ListPrice { get; set; }
    public decimal LearningCredit { get; set; }
    public string? Material { get; set; }
    public string? Objective { get; set; }
    public string? Target { get; set; }
    public string? Prerequisites { get; set; }
    public string? Outline { get; set; }
    public string? TowardCertOrExam { get; set; }
    public string? Note { get; set; }
    public string? OtherInfo { get; set; }
    public bool CanRepeat { get; set; }

    /// <summary>Number of linked certifications (subquery count).</summary>
    public int CertificationCount { get; set; }

    /// <summary>Number of linked job categories (subquery count).</summary>
    public int JobCategoryCount { get; set; }

    /// <summary>Navigation objects loaded by multi-map.</summary>
    public PartnerLookup Partner { get; set; } = new();
    public CourseGroupLookup? CourseGroup { get; set; }
    public PublishStatusLookup PublishStatus { get; set; } = new();

    /// <summary>Linked certification ids; populated for single-record reads only.</summary>
    public List<int> CertificationPkids { get; set; } = new();

    /// <summary>Linked job category ids; populated for single-record reads only.</summary>
    public List<short> JobCategoryPkids { get; set; } = new();
}
