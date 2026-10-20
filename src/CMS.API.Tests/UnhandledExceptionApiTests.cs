using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Text.Json;
using CMS.API.Middleware;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;

namespace CMS.API.Tests;

/// <summary>
/// <see cref="UnhandledExceptionMiddleware"/>: a throwing repository yields the generic 500, while
/// 401 / 403 / 400 keep their shapes. The factory runs in Development, where the developer
/// exception page would otherwise send the stack trace.
/// </summary>
public class UnhandledExceptionApiTests : IClassFixture<ApiTestFactory>
{
    // What a real SqlException can carry: the statement and connection details.
    private const string LeakyMessage =
        "Invalid column name 'Nope'. SELECT pkid, Description FROM PublishStatus; " +
        "Server=.\\SQLEXPRESS;Database=CMS;User Id=sa;Password=hunter2";

    private readonly WebApplicationFactory<Program> _factory;
    private readonly CapturingLoggerProvider _logs = new();

    public UnhandledExceptionApiTests(ApiTestFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.ConfigureLogging(logging => logging.AddProvider(_logs));
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IPublishStatusRepository>();
                services.AddSingleton(ThrowingProxy<IPublishStatusRepository>.Create(LeakyMessage));
            });
        });
    }

    [Fact]
    public async Task ThrowingEndpoint_Returns500WithGenericMessageOnly()
    {
        var response = await _factory.CreateAuthenticatedClient().GetAsync("/api/publishstatuses");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var json = JsonDocument.Parse(body);
        Assert.Equal(UnhandledExceptionMiddleware.GenericMessage, json.RootElement.GetProperty("title").GetString());
        Assert.Equal(500, json.RootElement.GetProperty("status").GetInt32());
        Assert.False(string.IsNullOrEmpty(json.RootElement.GetProperty("traceId").GetString()));
        Assert.Equal(["status", "title", "traceId"], json.RootElement.EnumerateObject().Select(p => p.Name).Order());

        foreach (var leak in new[] { "SELECT", "PublishStatus", "SQLEXPRESS", "Password", "hunter2",
                     "InvalidOperationException", "ThrowingProxy", " at ", ".cs:line" })
            Assert.DoesNotContain(leak, body);
    }

    [Fact]
    public async Task ThrowingEndpoint_LogsTheFullException()
    {
        await _factory.CreateAuthenticatedClient().GetAsync("/api/publishstatuses");

        var entry = Assert.Single(_logs.Entries, e => e.Category == typeof(UnhandledExceptionMiddleware).FullName);
        Assert.Equal(LogLevel.Error, entry.Level);
        Assert.Contains("/api/publishstatuses", entry.Message);
        var ex = Assert.IsType<InvalidOperationException>(entry.Exception);
        Assert.Equal(LeakyMessage, ex.Message);
        Assert.NotNull(ex.StackTrace);
    }

    [Fact]
    public async Task WithoutToken_Still401WithBearerChallengeAndNoBody()
    {
        var response = await _factory.CreateClient().GetAsync("/api/publishstatuses");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Contains(response.Headers.WwwAuthenticate, h => h.Scheme == "Bearer");
        Assert.Empty(await response.Content.ReadAsStringAsync());
        Assert.DoesNotContain(_logs.Entries, e => e.Category == typeof(UnhandledExceptionMiddleware).FullName);
    }

    [Fact]
    public async Task NonAdminOnAdminAction_Still403WithNoBody()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", TestAuth.CreateToken(roles: ["User"]));

        var response = await client.PostAsJsonAsync("/api/auth/reset-password", new { userId = "jenny" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Empty(await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task InvalidRequest_Still400ValidationProblem()
    {
        // Model validation answers before the (throwing) repository is reached.
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/publishstatuses",
            new { pkid = 9, description = "" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.True(json.RootElement.GetProperty("errors").TryGetProperty("Description", out _));
    }
}

/// <summary>An implementation of <typeparamref name="T"/> whose every method throws.</summary>
public class ThrowingProxy<T> : DispatchProxy where T : class
{
    private string _message = "";

    public static T Create(string message)
    {
        var proxy = Create<T, ThrowingProxy<T>>();
        ((ThrowingProxy<T>)(object)proxy)._message = message;
        return proxy;
    }

    protected override object? Invoke(MethodInfo? targetMethod, object?[]? args) =>
        throw new InvalidOperationException(_message);
}

public class CapturingLoggerProvider : ILoggerProvider
{
    public record Entry(string Category, LogLevel Level, string Message, Exception? Exception);

    public ConcurrentQueue<Entry> Entries { get; } = new();

    public ILogger CreateLogger(string categoryName) => new Logger(categoryName, Entries);

    public void Dispose() { }

    private class Logger(string category, ConcurrentQueue<Entry> entries) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            entries.Enqueue(new Entry(category, logLevel, formatter(state, exception), exception));
    }
}
