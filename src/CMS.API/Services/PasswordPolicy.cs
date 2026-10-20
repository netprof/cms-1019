namespace CMS.API.Services;

/// <summary>
/// Complexity rule for a new password: at least 8 characters and at least 3 of 4 classes —
/// uppercase A–Z, lowercase a–z, digit 0–9, symbol (any other non-whitespace character).
/// Mirrored by <c>core/auth/password-policy.ts</c> in the Angular app; keep the two in step.
/// </summary>
public static class PasswordPolicy
{
    public const int MinLength = 8;
    public const int MinClasses = 3;

    public const string Message =
        "密碼長度至少需 8 碼，且內容須至少包含四種字元的其中三種：大寫英文／小寫英文／數字／符號 "
        + "(Password must be at least 8 characters and contain at least 3 of the 4 classes: "
        + "uppercase / lowercase / digit / symbol.)";

    public static bool IsSatisfiedBy(string password)
    {
        if (password.Length < MinLength) return false;

        var classes = 0;
        if (password.Any(c => c is >= 'A' and <= 'Z')) classes++;
        if (password.Any(c => c is >= 'a' and <= 'z')) classes++;
        if (password.Any(c => c is >= '0' and <= '9')) classes++;
        if (password.Any(IsSymbol)) classes++;
        return classes >= MinClasses;
    }

    private static bool IsSymbol(char c) =>
        !char.IsWhiteSpace(c) && c is not (>= 'A' and <= 'Z') and not (>= 'a' and <= 'z') and not (>= '0' and <= '9');
}
