namespace CMS.API.Models;

public class AppUserQuery
{
    /// <summary>Matches UserId or UserName (contains).</summary>
    public string? Keyword { get; set; }

    /// <summary>Tri-state: null = all, true = active only, false = inactive only.</summary>
    public bool? IsActive { get; set; }

    /// <summary>Only users assigned this role (via AppUserRole).</summary>
    public string? RoleId { get; set; }

    /// <summary>PasswordUpdatedTime on or after this date (inclusive).</summary>
    public DateOnly? PasswordUpdatedFrom { get; set; }

    /// <summary>PasswordUpdatedTime on or before this date (inclusive).</summary>
    public DateOnly? PasswordUpdatedTo { get; set; }
}
