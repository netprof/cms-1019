namespace CMS.API.Models;

public class Partner
{
    /// <summary>smallint IDENTITY key.</summary>
    public short Pkid { get; set; }
    public string Name { get; set; } = "";
    public string AppKey { get; set; } = "";
    public string NameOnPartnerMenu { get; set; } = "";
    public string NameOnCourseDetailPage { get; set; } = "";
    public int DisplayOrder { get; set; }
    public string? ImageFilename { get; set; }
}
