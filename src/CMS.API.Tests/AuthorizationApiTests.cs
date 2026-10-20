using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

/// <summary>Global bearer authorization; the per-feature test classes use authenticated clients.</summary>
public class AuthorizationApiTests : IClassFixture<ApiTestFactory>
{
    private const string Protected = "/api/approles";

    private readonly WebApplicationFactory<Program> _factory;

    public AuthorizationApiTests(ApiTestFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAppRoleRepository>();
            services.AddSingleton<IAppRoleRepository>(new FakeAppRoleRepository());
        }));
    }

    private Task<HttpResponseMessage> GetWithToken(string? scheme, string? token, WebApplicationFactory<Program>? factory = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, Protected);
        if (scheme is not null) request.Headers.Authorization = new AuthenticationHeaderValue(scheme, token);
        return (factory ?? _factory).CreateClient().SendAsync(request);
    }

    // ---- protected endpoints ----

    [Fact]
    public async Task ProtectedEndpoint_WithoutToken_Returns401WithBearerChallenge()
    {
        var response = await GetWithToken(null, null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains(response.Headers.WwwAuthenticate, h => h.Scheme == "Bearer");
    }

    [Fact]
    public async Task ProtectedEndpoint_WithValidToken_Returns200()
    {
        var response = await GetWithToken("Bearer", TestAuth.CreateToken());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_WithTokenFromLogin_Returns200()
    {
        var client = _factory.CreateClient();
        var login = await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest { UserId = "helen", Password = FakeAuthRepository.Password });
        var profile = await login.Content.ReadFromJsonAsync<LoginResponse>();

        var response = await GetWithToken("Bearer", profile!.AccessToken);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    public static TheoryData<string, string> InvalidTokens => new()
    {
        { "Bearer", TestAuth.CreateToken(signingKey: "another-key-that-is-also-32-bytes-long") },
        { "Bearer", TestAuth.CreateToken(expires: DateTime.UtcNow.AddHours(-1)) },
        { "Bearer", "not-a-jwt" },
        { "Bearer", TestAuth.CreateToken()[..^4] }, // tampered signature
        { "Basic", TestAuth.CreateToken() },         // valid token, wrong scheme
    };

    [Theory]
    [MemberData(nameof(InvalidTokens))]
    public async Task ProtectedEndpoint_WithInvalidToken_Returns401(string scheme, string token)
    {
        var response = await GetWithToken(scheme, token);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedEndpoint_WhenSigningKeyNotConfigured_Returns401Not500()
    {
        var unconfigured = _factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAuthRepository>();
            services.AddSingleton<IAuthRepository>(new FakeAuthRepository(signingKey: null));
        }));

        var response = await GetWithToken("Bearer", TestAuth.CreateToken(), unconfigured);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // ---- anonymous endpoints ----

    [Fact]
    public async Task Login_WithoutToken_StaysAnonymous()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/auth/login",
            new LoginRequest { UserId = "helen", Password = FakeAuthRepository.Password });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Login_WithInvalidToken_StillAnonymous()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-a-jwt");

        var response = await client.PostAsJsonAsync("/api/auth/login",
            new LoginRequest { UserId = "helen", Password = FakeAuthRepository.Password });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public void EveryAction_RequiresAuthorization_ExceptLoginAndTokenUsageIngest()
    {
        var actions = _factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .Select(e => (Endpoint: e, Action: e.Metadata.GetMetadata<ControllerActionDescriptor>()))
            .Where(x => x.Action is not null)
            .ToList();
        Assert.NotEmpty(actions);

        var anonymous = actions
            .Where(x => x.Endpoint.Metadata.GetMetadata<IAllowAnonymous>() is not null)
            .Select(x => $"{x.Action!.ControllerName}.{x.Action.ActionName}")
            .Order()
            .ToList();
        Assert.Equal(["Auth.Login", "TokenUsages.Ingest"], anonymous);

        Assert.All(actions, x => Assert.NotEmpty(x.Endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>()));
    }
}
