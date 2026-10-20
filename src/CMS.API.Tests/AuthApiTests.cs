using System.Net;
using System.Net.Http.Json;
using System.Text;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace CMS.API.Tests;

public class AuthApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    private static readonly DateTimeOffset Now = new(2026, 10, 20, 9, 0, 0, TimeSpan.Zero);

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    public AuthApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAuthRepository>();
            services.AddSingleton<IAuthRepository>(new FakeAuthRepository());
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(new FixedTimeProvider(Now));
        }));
    }

    private Task<HttpResponseMessage> Login(string userId, string password) =>
        _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest { UserId = userId, Password = password });

    private static async Task<JsonWebToken> LoginToken(HttpResponseMessage response)
    {
        var body = await response.Content.ReadFromJsonAsync<LoginResponse>();
        return new JsonWebToken(body!.AccessToken);
    }

    [Fact]
    public async Task Login_ValidActiveUser_ReturnsProfileWithToken()
    {
        var response = await Login("helen", FakeAuthRepository.Password);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.Equal("helen", body!.UserId);
        Assert.Equal("Helen", body.UserName);
        Assert.False(string.IsNullOrEmpty(body.AccessToken));
    }

    [Fact]
    public async Task Login_Response_NeverContainsPasswordHash()
    {
        var response = await Login("helen", FakeAuthRepository.Password);

        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("passwordHash", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(CMS.API.Services.PasswordHasher.Sha256Hex(FakeAuthRepository.Password), json);
    }

    [Theory]
    [InlineData("helen", "wrong-password")]   // wrong password
    [InlineData("nobody", FakeAuthRepository.Password)] // unknown UserId
    [InlineData("jenny", FakeAuthRepository.Password)]  // IsActive = 0
    [InlineData("HELEN", FakeAuthRepository.Password)]  // UserId must match exactly
    [InlineData("helen", "")]
    [InlineData("", FakeAuthRepository.Password)]
    public async Task Login_InvalidCredentials_Returns401WithGenericMessage(string userId, string password)
    {
        var response = await Login(userId, password);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync();
        Assert.Contains("invalid credentials", json);
        Assert.DoesNotContain("accessToken", json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Login_Token_CarriesUserAndRoleClaims()
    {
        var token = await LoginToken(await Login("helen", FakeAuthRepository.Password));

        Assert.Equal("helen", token.Subject);
        Assert.Equal("Helen", token.GetClaim(JwtRegisteredClaimNames.Name).Value);
        Assert.Equal(["Admin", "User"], token.Claims.Where(c => c.Type == "role").Select(c => c.Value).Order());
    }

    [Fact]
    public async Task Login_Token_ExpiresTwentyFourHoursAfterIssue()
    {
        var token = await LoginToken(await Login("helen", FakeAuthRepository.Password));

        Assert.Equal(Now.UtcDateTime, token.IssuedAt);
        Assert.Equal(Now.UtcDateTime.AddHours(24), token.ValidTo);
    }

    [Fact]
    public async Task Login_Token_IsSignedWithSysConfigKey()
    {
        var response = await Login("helen", FakeAuthRepository.Password);
        var body = await response.Content.ReadFromJsonAsync<LoginResponse>();

        var result = await new JsonWebTokenHandler().ValidateTokenAsync(body!.AccessToken, new TokenValidationParameters
        {
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(FakeAuthRepository.SigningKey)),
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = false, // the fixed clock is in the past relative to the real one
        });
        Assert.True(result.IsValid, result.Exception?.Message);
    }
}
