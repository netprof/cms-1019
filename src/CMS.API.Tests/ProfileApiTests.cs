using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

/// <summary><c>PUT /api/auth/profile</c>: the signed-in user edits their own UserName.</summary>
public class ProfileApiTests : IClassFixture<ApiTestFactory>
{
    private const string Route = "/api/auth/profile";

    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeAuthRepository _repository = new();

    public ProfileApiTests(ApiTestFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAuthRepository>();
            services.AddSingleton<IAuthRepository>(_repository);
        }));
    }

    /// <summary>Signed in as <paramref name="userId"/> (the token's <c>sub</c>).</summary>
    private Task<HttpResponseMessage> Put(object body, string? userId = "helen")
    {
        var client = _factory.CreateClient();
        if (userId is not null)
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", TestAuth.CreateToken(userId));
        return client.PutAsJsonAsync(Route, body);
    }

    [Fact]
    public async Task UpdateProfile_UpdatesUserNameOfTheTokenUser_Trimmed()
    {
        var response = await Put(new { userName = "  Helen Wang  " });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var profile = await response.Content.ReadFromJsonAsync<UserProfile>();
        Assert.Equal("helen", profile!.UserId);
        Assert.Equal("Helen Wang", profile.UserName);
        Assert.Equal("Helen Wang", _repository.UserName("helen"));
    }

    [Fact]
    public async Task UpdateProfile_IgnoresUserIdRolesAndIsActiveInTheBody()
    {
        var response = await Put(new { userId = "jenny", userName = "Hacked", roleIds = new[] { "Admin" }, isActive = true });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var profile = await response.Content.ReadFromJsonAsync<UserProfile>();
        Assert.Equal("helen", profile!.UserId);
        Assert.Equal("Hacked", _repository.UserName("helen"));
        Assert.Equal("Jenny", _repository.UserName("jenny"));
        Assert.Equal(["User"], await _repository.GetRoleIdsAsync("jenny"));
        Assert.False((await _repository.GetCredentialAsync("jenny"))!.IsActive);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task UpdateProfile_EmptyOrWhitespaceUserName_Returns400(string? userName)
    {
        var response = await Put(new { userName });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Helen", _repository.UserName("helen"));
    }

    [Fact]
    public async Task UpdateProfile_UserNameOver200Chars_Returns400()
    {
        var response = await Put(new { userName = new string('x', 201) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Helen", _repository.UserName("helen"));
    }

    [Fact]
    public async Task UpdateProfile_WithoutToken_Returns401()
    {
        var response = await Put(new { userName = "Anyone" }, userId: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("Helen", _repository.UserName("helen"));
    }

    [Fact]
    public async Task UpdateProfile_TokenUserNoLongerExists_Returns404()
    {
        var response = await Put(new { userName = "Ghost" }, userId: "deleted-user");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
