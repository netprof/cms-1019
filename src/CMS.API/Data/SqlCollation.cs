namespace CMS.API.Data;

/// <summary>
/// In-memory string comparison that agrees with the database's case-insensitive collation
/// (<c>Chinese_Taiwan_Stroke_CI_AS</c>) on key and text columns, for C# code that groups,
/// sorts or matches values SQL Server would also compare.
/// </summary>
public static class SqlCollation
{
    public static readonly StringComparer Comparer = StringComparer.OrdinalIgnoreCase;
}
