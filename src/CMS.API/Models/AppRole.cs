namespace CMS.API.Models;

public class AppRole
{
    public int Pkid { get; set; }
    public string RoleId { get; set; } = "";
    public string RoleName { get; set; } = "";
    public int PermissionLevel { get; set; }
    public string? Description { get; set; }

    /// <summary>Number of users assigned to the role (subquery count).</summary>
    public int UserCount { get; set; }

    /// <summary>Assigned user ids; populated for single-record reads only.</summary>
    public List<string> UserIds { get; set; } = new();
}
