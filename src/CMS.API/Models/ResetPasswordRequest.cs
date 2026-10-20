using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>Admin reset of another user's password to the SysConfig default. No password is sent.</summary>
public class ResetPasswordRequest
{
    [Required, StringLength(200)]
    public string UserId { get; set; } = "";
}
