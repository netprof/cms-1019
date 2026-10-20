using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

/// <summary>
/// Self-service password change. Plain passwords only (never trimmed); hashes stay on the server.
/// </summary>
public class ChangePasswordRequest
{
    [Required]
    public string CurrentPassword { get; set; } = "";

    [Required]
    public string NewPassword { get; set; } = "";

    [Required]
    public string ConfirmPassword { get; set; } = "";
}
