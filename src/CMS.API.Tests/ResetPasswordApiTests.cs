using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

/// <summary><c>POST /api/auth/reset-password</c>: Admin resets a user to the SysConfig default password.</summary>
public class ResetPasswordApiTests : IClassFixture<ApiTestFactory>
{
    private const string Route = "/api/auth/reset-password";

    /// <summary>Differs from every seeded password, so a reset visibly changes the hash.</summary>
    private const string SysConfigDefault = "Default#Pw2026";

    private static readonly DateTimeOffset Now = new(2026, 10, 20, 10, 15, 0, TimeSpan.Zero);

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeAuthRepository _auth = new();
    private readonly string _originalHash;

    public ResetPasswordApiTests(ApiTestFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAuthRepository>();
            services.AddSingleton<IAuthRepository>(_auth);
            services.RemoveAll<IAppUserRepository>(); // source of appConfig.defaultPassword
            services.AddSingleton<IAppUserRepository>(new FakeAppUserRepository(SysConfigDefault));
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(new FixedTimeProvider(Now));
        }));
        _originalHash = _auth.StoredHash("jenny")!;
    }

    /// <summary>Posts as a caller holding <paramref name="roles"/>; null roles = no token at all.</summary>
    private Task<HttpResponseMessage> Post(object body, string[]? roles)
    {
        var client = _factory.CreateClient();
        if (roles is not null)
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", TestAuth.CreateToken("helen", roles));
        return client.PostAsJsonAsync(Route, body);
    }

    private void AssertUnchanged()
    {
        Assert.Equal(_originalHash, _auth.StoredHash("jenny"));
        Assert.Null(_auth.PasswordUpdatedTime("jenny"));
    }

    // ---- access control ----

    [Theory]
    [InlineData("")]            // signed in, no roles
    [InlineData("User")]
    [InlineData("User,Editor")]
    [InlineData("admin")]       // role ids are matched exactly
    public async Task NonAdmin_Gets403_AndNothingChanges(string roles)
    {
        var response = await Post(new { userId = "jenny" }, roles.Split(',', StringSplitOptions.RemoveEmptyEntries));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        AssertUnchanged();
    }

    [Fact]
    public async Task WithoutToken_Gets401()
    {
        var response = await Post(new { userId = "jenny" }, roles: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        AssertUnchanged();
    }

    // ---- reset ----

    [Fact]
    public async Task Admin_SetsSha256OfSysConfigDefault_AndStampsPasswordUpdatedTime()
    {
        var response = await Post(new { userId = "jenny" }, ["User", "Admin"]);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(PasswordHasher.Sha256Hex(SysConfigDefault), _auth.StoredHash("jenny"));
        Assert.NotEqual(_originalHash, _auth.StoredHash("jenny"));
        Assert.Equal(Now.UtcDateTime, _auth.PasswordUpdatedTime("jenny"));
    }

    [Fact]
    public async Task Admin_ResetsOnlyTheTargetUser()
    {
        var helenHash = _auth.StoredHash("helen");

        await Post(new { userId = "jenny" }, ["Admin"]);

        Assert.Equal(helenHash, _auth.StoredHash("helen"));
        Assert.Null(_auth.PasswordUpdatedTime("helen"));
    }

    [Fact]
    public async Task Admin_ResetUser_CanLogInWithTheDefault()
    {
        await Post(new { userId = "helen" }, ["Admin"]); // helen is active; jenny is not

        var login = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login",
            new { userId = "helen", password = SysConfigDefault });

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    }

    [Fact]
    public async Task Response_ContainsNoPasswordOrHash()
    {
        var response = await Post(new { userId = "jenny" }, ["Admin"]);

        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("", body);
        Assert.Empty(response.Content.Headers.ContentType?.MediaType ?? "");
    }

    [Fact]
    public async Task UnknownUser_Returns404()
    {
        var response = await Post(new { userId = "nobody" }, ["Admin"]);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task MissingUserId_Returns400(string userId)
    {
        var response = await Post(new { userId }, ["Admin"]);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        AssertUnchanged();
    }
}
