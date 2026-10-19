namespace CMS.API.Models;

public class AppRoleQuery
{
    /// <summary>Matches RoleId, RoleName or Description (contains).</summary>
    public string? Keyword { get; set; }
    public int? MinPermissionLevel { get; set; }
    public int? MaxPermissionLevel { get; set; }
}
