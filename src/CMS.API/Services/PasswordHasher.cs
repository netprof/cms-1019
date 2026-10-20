using System.Security.Cryptography;
using System.Text;

namespace CMS.API.Services;

/// <summary>
/// Produces the <c>AppUser.PasswordHash</c> value: lowercase hex SHA-256 of the UTF-8 password.
/// This matches the format of the rows already in the database.
/// </summary>
public static class PasswordHasher
{
    public static string Sha256Hex(string password) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(password)));
}
