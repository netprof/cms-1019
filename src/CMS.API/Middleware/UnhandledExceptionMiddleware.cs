using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Middleware;

/// <summary>
/// Turns any exception that escapes a controller or repository into one safe 500 response:
/// <see cref="ProblemDetails"/> with <see cref="GenericMessage"/> as the title and a <c>traceId</c>
/// to find the logged exception. The exception itself (message, stack trace, SQL text) is only logged.
/// Responses the app already produces (401, 403, 400 validation, mapped 409s) never throw, so they
/// pass through unchanged.
/// </summary>
public class UnhandledExceptionMiddleware(RequestDelegate next, ILogger<UnhandledExceptionMiddleware> logger)
{
    public const string GenericMessage = "An unexpected error occurred.";

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        // A client that disconnected gets no response; that is not a server error.
        catch (Exception ex) when (!context.RequestAborted.IsCancellationRequested)
        {
            var traceId = Activity.Current?.Id ?? context.TraceIdentifier;
            logger.LogError(ex, "Unhandled exception on {Method} {Path} (traceId {TraceId})",
                context.Request.Method, context.Request.Path, traceId);

            // Headers are already sent: the status cannot change, so let the server abort the response.
            if (context.Response.HasStarted) throw;

            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new ProblemDetails
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = GenericMessage,
                Extensions = { ["traceId"] = traceId },
            }, options: null, contentType: "application/problem+json");
        }
    }
}
