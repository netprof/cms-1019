using System.Security.Cryptography;
using System.Text;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace CMS.API.Controllers;

/// <summary>
/// Rejects the request with 401 unless its <c>X-Api-Key</c> header matches the
/// SysConfig <c>tokenUsageConfig.apiKey</c> (401 with a logged warning when that key is
/// not configured). Runs as an authorization filter, so it fires before model validation
/// (an unauthenticated caller never sees a 400).
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class RequireIngestApiKeyAttribute : Attribute, IAsyncAuthorizationFilter
{
    public const string HeaderName = "X-Api-Key";

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var supplied = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (string.IsNullOrEmpty(supplied))
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        var services = context.HttpContext.RequestServices;
        var expected = await services.GetRequiredService<IIngestApiKeyReader>().GetAsync();
        if (expected is null)
        {
            // A misconfigured server rejects every caller rather than failing with 500.
            services.GetRequiredService<ILogger<RequireIngestApiKeyAttribute>>().LogWarning(
                "Token usage ingest rejected: SysConfig 'tokenUsageConfig' row or its apiKey is missing.");
            context.Result = new UnauthorizedResult();
            return;
        }

        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(supplied), Encoding.UTF8.GetBytes(expected)))
        {
            context.Result = new UnauthorizedResult();
        }
    }
}
