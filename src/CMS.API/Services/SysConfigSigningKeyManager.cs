using System.Text;
using CMS.API.Repositories;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace CMS.API.Services;

/// <summary>
/// Feeds JWT bearer validation the SysConfig <c>appConfig.symmetricSecurityKey</c> that
/// <see cref="JwtTokenService"/> signs with. Plugged in as the bearer handler's
/// <c>ConfigurationManager</c>, the only async hook for signing keys. The key is cached for
/// <see cref="CacheDuration"/>; a token signed with an unknown key makes the handler call
/// <see cref="RequestRefresh"/>, so a rotated key is picked up on the next request.
/// A missing key is logged and yields no keys (every token → 401), not a 500.
/// </summary>
public sealed class SysConfigSigningKeyManager(
    IServiceScopeFactory scopeFactory, TimeProvider timeProvider, ILogger<SysConfigSigningKeyManager> logger)
    : IConfigurationManager<OpenIdConnectConfiguration>
{
    public static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);

    private readonly SemaphoreSlim _lock = new(1, 1);
    private OpenIdConnectConfiguration? _cached;
    private DateTimeOffset _expires;

    public async Task<OpenIdConnectConfiguration> GetConfigurationAsync(CancellationToken cancel)
    {
        if (_cached is { } hit && timeProvider.GetUtcNow() < _expires) return hit;

        await _lock.WaitAsync(cancel);
        try
        {
            if (_cached is { } fresh && timeProvider.GetUtcNow() < _expires) return fresh;

            var config = new OpenIdConnectConfiguration();
            try
            {
                using var scope = scopeFactory.CreateScope();
                var key = await scope.ServiceProvider.GetRequiredService<IAuthRepository>().GetJwtSigningKeyAsync();
                config.SigningKeys.Add(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)));
            }
            catch (InvalidOperationException ex)
            {
                // Not cached: the next request retries.
                logger.LogWarning(ex, "JWT validation has no signing key; every bearer token is rejected.");
                return config;
            }

            _cached = config;
            _expires = timeProvider.GetUtcNow() + CacheDuration;
            return config;
        }
        finally
        {
            _lock.Release();
        }
    }

    public void RequestRefresh() => _cached = null;
}
