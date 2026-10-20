using System.Net.Http.Headers;
using System.Text;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace CMS.API.Tests;

/// <summary>
/// The app with <see cref="FakeAuthRepository"/> in place of SysConfig, so bearer tokens signed
/// with <see cref="FakeAuthRepository.SigningKey"/> validate. Test classes still call
/// <c>WithWebHostBuilder</c> for their own fakes; this setup runs first.
/// </summary>
public class ApiTestFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder) =>
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAuthRepository>();
            services.AddSingleton<IAuthRepository>(new FakeAuthRepository());
        });
}

public static class TestAuth
{
    /// <summary>A token the API accepts; lifetime is against the real clock, not a test TimeProvider.</summary>
    public static string CreateToken(
        string userId = "helen", string[]? roles = null, string signingKey = FakeAuthRepository.SigningKey,
        DateTime? expires = null)
    {
        var now = DateTime.UtcNow;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Claims = new Dictionary<string, object>
            {
                [JwtRegisteredClaimNames.Sub] = userId,
                [JwtRegisteredClaimNames.Name] = userId,
                ["role"] = roles ?? ["Admin"],
            },
            IssuedAt = (expires ?? now.AddHours(1)).AddHours(-1),
            NotBefore = (expires ?? now.AddHours(1)).AddHours(-1),
            Expires = expires ?? now.AddHours(1),
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)), SecurityAlgorithms.HmacSha256),
        });
    }

    /// <summary>A client that sends a valid <c>Authorization: Bearer</c> token on every request.</summary>
    public static HttpClient CreateAuthenticatedClient(this WebApplicationFactory<Program> factory)
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", CreateToken());
        return client;
    }
}
