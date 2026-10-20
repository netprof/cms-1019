namespace CMS.API.Models;

/// <summary>
/// Response model. <c>PasswordHash</c> is deliberately absent: it never leaves the API.
/// </summary>
public class AppUser
{
    public int Pkid { get; set; }
    public string UserId { get; set; } = "";
    public string UserName { get; set; } = "";
    public bool IsActive { get; set; }
    public DateTime? PasswordUpdatedTime { get; set; }

    /// <summary>Number of roles assigned to the user (subquery count).</summary>
    public int RoleCount { get; set; }

    /// <summary>Assigned role ids; populated for single-record reads only.</summary>
    public List<string> RoleIds { get; set; } = new();
}
