using System.Data.Common;
using System.Reflection;
using System.Security.Claims;
using System.Text;
using CMS.API.Models;
using Dapper;
using Microsoft.IdentityModel.JsonWebTokens;

namespace CMS.API.Services;

/// <summary>
/// Writes one <c>RowAudit</c> row per business-table change. Generic over the entity type: the key
/// is the entity's <c>Pkid</c> property and the description comes from its properties by reflection.
/// Repositories call it after a successful Insert / Update / Delete, on the connection that made the
/// change and inside the same <see cref="Data.DbTransactionScope"/>, so a rolled-back change leaves
/// no audit row (and a failed audit insert rolls the change back).
/// </summary>
public class RowAuditWriter(IHttpContextAccessor httpContextAccessor, TimeProvider timeProvider)
{
    public const string SystemUserName = "system";

    /// <summary><c>ActionDesc</c> is <c>varchar(1000)</c>: at most 1000 bytes in the database code page.</summary>
    public const int MaxActionDescLength = 1000;

    /// <summary><c>UserName</c> is <c>nvarchar(100)</c>.</summary>
    public const int MaxUserNameLength = 100;

    // varchar under Chinese_Taiwan_Stroke_CI_AS is code page 950 (Big5): a Chinese character takes 2 bytes.
    private static readonly Encoding ColumnEncoding = GetColumnEncoding();

    private const string InsertSql = """
        INSERT INTO RowAudit (TableName, UserName, PrimaryKeyValues, ActionType, ActionDesc, [DateTime])
        VALUES (@TableName, @UserName, @PrimaryKeyValues, @ActionType, @ActionDesc, @DateTime)
        """;

    /// <param name="primaryKeyValues">For tables without a <c>pkid</c>; otherwise read from the entity.</param>
    public Task LogInsertAsync<T>(DbConnection conn, string tableName, T entity, string? primaryKeyValues = null)
        where T : class =>
        conn.ExecuteAsync(InsertSql, BuildInsert(tableName, entity, primaryKeyValues));

    /// <summary>Writes nothing when no compared property changed.</summary>
    /// <param name="primaryKeyValues">For tables without a <c>pkid</c>; otherwise read from the entity.</param>
    public async Task LogUpdateAsync<T>(DbConnection conn, string tableName, T before, T after, string? primaryKeyValues = null)
        where T : class
    {
        var entry = BuildUpdate(tableName, before, after, primaryKeyValues);
        if (entry.ActionDesc != "") await conn.ExecuteAsync(InsertSql, entry);
    }

    /// <param name="primaryKeyValues">For tables without a <c>pkid</c>; otherwise read from the entity.</param>
    public Task LogDeleteAsync<T>(DbConnection conn, string tableName, T entity, string? primaryKeyValues = null)
        where T : class =>
        conn.ExecuteAsync(InsertSql, BuildDelete(tableName, entity, primaryKeyValues));

    /// <summary>ActionDesc = the entity's first string property (declaration order).</summary>
    public RowAuditEntry BuildInsert<T>(string tableName, T entity, string? primaryKeyValues = null) where T : class =>
        Build(tableName, "Insert", entity, FirstStringValue(entity), primaryKeyValues);

    /// <summary>ActionDesc = the entity's first string property (declaration order).</summary>
    public RowAuditEntry BuildDelete<T>(string tableName, T entity, string? primaryKeyValues = null) where T : class =>
        Build(tableName, "Delete", entity, FirstStringValue(entity), primaryKeyValues);

    /// <summary>
    /// ActionDesc = comma-separated names of the scalar properties whose value differs (empty when
    /// none). Navigation objects and collections are not compared.
    /// </summary>
    public RowAuditEntry BuildUpdate<T>(string tableName, T before, T after, string? primaryKeyValues = null) where T : class
    {
        var changed = ReadableProperties(typeof(T))
            .Where(p => IsScalar(p.PropertyType) && !Equals(p.GetValue(before), p.GetValue(after)))
            .Select(p => p.Name);
        return Build(tableName, "Update", after, string.Join(",", changed), primaryKeyValues);
    }

    /// <summary>
    /// Cuts <paramref name="text"/> to fit <see cref="MaxActionDescLength"/> characters and bytes of
    /// the column's code page, never splitting a character.
    /// </summary>
    public static string? Truncate(string? text)
    {
        // At most 2 bytes per UTF-16 char in code page 950, so short text always fits.
        if (text is null || text.Length <= MaxActionDescLength / 2) return text;

        var result = new StringBuilder();
        var bytes = 0;
        foreach (var rune in text.EnumerateRunes())
        {
            var runeText = rune.ToString();
            bytes += ColumnEncoding.GetByteCount(runeText);
            if (bytes > MaxActionDescLength || result.Length + runeText.Length > MaxActionDescLength) break;
            result.Append(runeText);
        }
        return result.ToString();
    }

    private RowAuditEntry Build(string tableName, string actionType, object entity, string? actionDesc, string? primaryKeyValues) => new()
    {
        TableName = tableName,
        UserName = CurrentUserName(),
        PrimaryKeyValues = primaryKeyValues ?? PrimaryKeyValue(entity),
        ActionType = actionType,
        ActionDesc = Truncate(actionDesc),
        DateTime = timeProvider.GetUtcNow().UtcDateTime,
    };

    /// <summary>The <c>name</c> claim of the current request's JWT, or "system" without a signed-in user.</summary>
    private string CurrentUserName()
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user?.Identity?.IsAuthenticated != true) return SystemUserName;
        var name = user.FindFirstValue(JwtRegisteredClaimNames.Name);
        if (string.IsNullOrWhiteSpace(name)) return SystemUserName;
        // RowAudit.UserName is nvarchar(100) but AppUser.UserName is nvarchar(200); an overflow would
        // fail the audit insert and roll back the change it describes.
        return name.Length <= MaxUserNameLength ? name : name[..MaxUserNameLength];
    }

    private static string PrimaryKeyValue(object entity)
    {
        var pkid = entity.GetType().GetProperty("Pkid", BindingFlags.Public | BindingFlags.Instance | BindingFlags.IgnoreCase)
            ?? throw new InvalidOperationException($"{entity.GetType().Name} has no Pkid property to audit.");
        return Convert.ToString(pkid.GetValue(entity), System.Globalization.CultureInfo.InvariantCulture) ?? "";
    }

    private static string? FirstStringValue(object entity) =>
        ReadableProperties(entity.GetType()).FirstOrDefault(p => p.PropertyType == typeof(string))?.GetValue(entity) as string;

    /// <summary>Public instance properties in declaration order (metadata order, which reflection does not guarantee otherwise).</summary>
    private static IEnumerable<PropertyInfo> ReadableProperties(Type type) =>
        type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.CanRead && p.GetIndexParameters().Length == 0)
            .OrderBy(p => p.MetadataToken);

    private static bool IsScalar(Type type)
    {
        type = Nullable.GetUnderlyingType(type) ?? type;
        return type.IsPrimitive || type.IsEnum
            || type == typeof(string) || type == typeof(decimal) || type == typeof(Guid)
            || type == typeof(DateTime) || type == typeof(DateTimeOffset) || type == typeof(TimeSpan)
            || type == typeof(DateOnly) || type == typeof(TimeOnly);
    }

    private static Encoding GetColumnEncoding()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        return Encoding.GetEncoding(950);
    }
}
