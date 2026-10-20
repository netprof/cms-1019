using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Self-service profile edit. Only UserName: the UserId comes from the JWT, and anything
/// else in the body (userId, roleIds, isActive) has no property here and is ignored.
/// </summary>
public class UpdateProfileRequest
{
    // [Required] also rejects whitespace-only values.
    [Required, StringLength(200)]
    public string UserName { get; set; } = "";
}
