using CMS.API.Services;

namespace CMS.API.Tests;

public class PasswordPolicyTests
{
    [Theory]
    [InlineData("Abcdef1#")]      // exactly 8, all 4 classes
    [InlineData("Abcdefg1")]      // upper + lower + digit
    [InlineData("abcdefg#1")]     // lower + digit + symbol
    [InlineData("ABCDEFG#1")]     // upper + digit + symbol
    [InlineData("Abcdefg#")]      // upper + lower + symbol
    [InlineData("密碼密碼Ab12")]   // a non-ASCII character counts as a symbol
    public void Accepts_AtLeast8Chars_WithAtLeast3Classes(string password) =>
        Assert.True(PasswordPolicy.IsSatisfiedBy(password));

    [Theory]
    [InlineData("")]
    [InlineData("Ab1#xyz")]       // 7 chars, all 4 classes
    [InlineData("abcdefgh")]      // 1 class
    [InlineData("abcdefg1")]      // 2 classes
    [InlineData("ABCDEFG#")]      // 2 classes
    [InlineData("abcd 1234")]     // whitespace is not a symbol: 2 classes
    [InlineData("密碼密碼abcd")]   // lower + symbol: 2 classes
    public void Rejects_ShortPasswords_OrFewerThan3Classes(string password) =>
        Assert.False(PasswordPolicy.IsSatisfiedBy(password));
}
