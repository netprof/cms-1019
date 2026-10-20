using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

/// <summary><c>POST /api/auth/change-password</c> for the signed-in user (token <c>sub</c>).</summary>
public class ChangePasswordApiTests : IClassFixture<ApiTestFactory>
{
    private const string Route = "/api/auth/change-password";
    private const string Current = FakeAuthRepository.Password;
    private const string Valid = "NewPass#2026";

    private static readonly DateTimeOffset Now = new(2026, 10, 20, 9, 30, 0, TimeSpan.Zero);

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeAuthRepository _repository = new();
    private readonly string _originalHash;

    public ChangePasswordApiTests(ApiTestFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAuthRepository>();
            services.AddSingleton<IAuthRepository>(_repository);
            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(new FixedTimeProvider(Now));
        }));
        _originalHash = _repository.StoredHash("helen")!;
    }

    private Task<HttpResponseMessage> Post(object body, string? userId = "helen")
    {
        var client = _factory.CreateClient();
        if (userId is not null)
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", TestAuth.CreateToken(userId));
        return client.PostAsJsonAsync(Route, body);
    }

    private static object Body(string current = Current, string next = Valid, string? confirm = null) =>
        new { currentPassword = current, newPassword = next, confirmPassword = confirm ?? next };

    private void AssertUnchanged()
    {
        Assert.Equal(_originalHash, _repository.StoredHash("helen"));
        Assert.Null(_repository.PasswordUpdatedTime("helen"));
    }

    /// <summary>Field errors of a 400, keyed case-insensitively.</summary>
    private static async Task<Dictionary<string, string[]>> Errors(HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>();
        return new Dictionary<string, string[]>(problem!.Errors, StringComparer.OrdinalIgnoreCase);
    }

    // ---- success ----

    [Fact]
    public async Task ValidChange_StoresSha256OfNewPassword_AndStampsPasswordUpdatedTime()
    {
        var response = await Post(Body());

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(PasswordHasher.Sha256Hex(Valid), _repository.StoredHash("helen"));
        Assert.Equal(Now.UtcDateTime, _repository.PasswordUpdatedTime("helen"));
        Assert.Equal("", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task ValidChange_ChangesOnlyTheTokenUser_IgnoringAUserIdInTheBody()
    {
        var jennyHash = _repository.StoredHash("jenny");

        var response = await Post(new { userId = "jenny", currentPassword = Current, newPassword = Valid, confirmPassword = Valid });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(PasswordHasher.Sha256Hex(Valid), _repository.StoredHash("helen"));
        Assert.Equal(jennyHash, _repository.StoredHash("jenny"));
    }

    [Fact]
    public async Task ValidChange_NewPasswordLogsIn_OldOneNoLonger()
    {
        await Post(Body());
        var client = _factory.CreateClient();

        var withNew = await client.PostAsJsonAsync("/api/auth/login", new { userId = "helen", password = Valid });
        var withOld = await client.PostAsJsonAsync("/api/auth/login", new { userId = "helen", password = Current });

        Assert.Equal(HttpStatusCode.OK, withNew.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, withOld.StatusCode);
    }

    // ---- current password ----

    [Fact]
    public async Task WrongCurrentPassword_Returns400NotASessionEnding401_AndChangesNothing()
    {
        var response = await Post(Body(current: "wrong-password"));

        var errors = await Errors(response);
        Assert.True(errors.ContainsKey("currentPassword"), "missing error: currentPassword");
        AssertUnchanged();
    }

    // ---- complexity ----

    [Theory]
    [InlineData("Ab1#xyz")]       // 7 chars, all 4 classes: too short
    [InlineData("abcdefgh")]      // 1 class
    [InlineData("abcdefg1")]      // 2 classes: lower + digit
    [InlineData("ABCDEFG#")]      // 2 classes: upper + symbol
    public async Task NewPasswordBreakingComplexity_Returns400WithPolicyMessage_AndChangesNothing(string newPassword)
    {
        var response = await Post(Body(next: newPassword));

        var errors = await Errors(response);
        Assert.Equal([PasswordPolicy.Message], errors["newPassword"]);
        AssertUnchanged();
    }

    // ---- confirmation ----

    [Fact]
    public async Task ConfirmationMismatch_Returns400_AndChangesNothing()
    {
        var response = await Post(Body(confirm: Valid + "x"));

        var errors = await Errors(response);
        Assert.True(errors.ContainsKey("confirmPassword"), "missing error: confirmPassword");
        Assert.False(errors.ContainsKey("newPassword"), "unexpected error: newPassword");
        AssertUnchanged();
    }

    [Fact]
    public async Task AllRulesBroken_ReportsEachField()
    {
        var response = await Post(Body(current: "wrong", next: "short", confirm: "other"));

        var errors = await Errors(response);
        Assert.True(errors.ContainsKey("currentPassword"), "missing error: currentPassword");
        Assert.True(errors.ContainsKey("newPassword"), "missing error: newPassword");
        Assert.True(errors.ContainsKey("confirmPassword"), "missing error: confirmPassword");
        AssertUnchanged();
    }

    [Fact]
    public async Task MissingFields_Return400()
    {
        var response = await Post(new { currentPassword = Current });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        AssertUnchanged();
    }

    // ---- auth ----

    [Fact]
    public async Task WithoutToken_Returns401()
    {
        var response = await Post(Body(), userId: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        AssertUnchanged();
    }

    [Fact]
    public async Task Response_NeverContainsAHash()
    {
        var response = await Post(Body(current: "wrong"));

        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain(_originalHash, json);
        Assert.DoesNotContain(PasswordHasher.Sha256Hex(Valid), json);
        Assert.DoesNotContain("hash", json, StringComparison.OrdinalIgnoreCase);
    }
}
