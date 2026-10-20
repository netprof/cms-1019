using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Write DTO. No password fields: the hash is server-generated on create and
/// only changed through the reset-password endpoint.
/// </summary>
public class AppUserRequest
{
    [Required, StringLength(200)]
    public string UserId { get; set; } = "";

    [Required, StringLength(200)]
    public string UserName { get; set; } = "";

    public bool IsActive { get; set; } = true;

    public List<string> RoleIds { get; set; } = new();
}
