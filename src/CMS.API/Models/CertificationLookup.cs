namespace CMS.API.Models;

public class CertificationLookup
{
    public int Pkid { get; set; }
    /// <summary>nchar(100) in the DB — trimmed in SQL.</summary>
    public string Title { get; set; } = "";
    public short PartnerPkid { get; set; }
}
