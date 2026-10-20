namespace CMS.API.Models;

/// <summary>User profile returned by a successful login. Never carries <c>PasswordHash</c>.</summary>
public class LoginResponse
{
    public string UserId { get; set; } = "";
    public string UserName { get; set; } = "";
    public string AccessToken { get; set; } = "";
}
