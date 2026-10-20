namespace CMS.API.Models;

/// <summary>
/// Internal read model for the login check. Holds <c>PasswordHash</c>, so it must never be
/// returned from an endpoint; <see cref="LoginResponse"/> is the response shape.
/// </summary>
public class LoginCredential
{
    public string UserId { get; set; } = "";
    public string UserName { get; set; } = "";
    public bool IsActive { get; set; }
    public string PasswordHash { get; set; } = "";
}
