using CMS.API.Services;

namespace CMS.API.Tests;

public class PasswordHasherTests
{
    [Fact]
    public void Sha256Hex_MatchesStandardTestVector()
    {
        // FIPS 180-4 test vector for "abc"; same lowercase-hex format as the rows in AppUser.
        Assert.Equal(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            PasswordHasher.Sha256Hex("abc"));
    }

    [Fact]
    public void Sha256Hex_IsLowercase64HexChars()
    {
        var hash = PasswordHasher.Sha256Hex("anything");

        Assert.Equal(64, hash.Length);
        Assert.Matches("^[0-9a-f]{64}$", hash);
    }

    [Fact]
    public void Sha256Hex_HashesUtf8Bytes()
    {
        // UTF-8 vs UTF-16 would differ for non-ASCII input; this pins UTF-8 (sha256sum of the bytes).
        Assert.Equal(
            "ef8b49458c14f6596350242ed373a70d63b8ba1332b01cd6f9802335aeae637c",
            PasswordHasher.Sha256Hex("密碼"));
    }
}
