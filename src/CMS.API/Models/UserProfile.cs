namespace CMS.API.Models;

/// <summary>The signed-in user's editable profile, as returned by <c>PUT /api/auth/profile</c>.</summary>
public class UserProfile
{
    public string UserId { get; set; } = "";
    public string UserName { get; set; } = "";
}
