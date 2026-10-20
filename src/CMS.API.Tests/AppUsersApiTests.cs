using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

public class AppUsersApiTests : IClassFixture<ApiTestFactory>
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeAppUserRepository _repository = new();

    private static readonly string DefaultHash = PasswordHasher.Sha256Hex(FakeAppUserRepository.DefaultPassword);

    public AppUsersApiTests(ApiTestFactory factory)
    {
        // Each test class instance gets its own fake repository (fresh data).
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAppUserRepository>();
            services.AddSingleton<IAppUserRepository>(_repository);
        }));
    }

    private static AppUserRequest NewRequest(string id = "kevin") => new()
    {
        UserId = id, UserName = "Kevin", IsActive = true, RoleIds = ["User"],
    };

    // ---- list / filter ----

    [Fact]
    public async Task GetAll_ReturnsUsersWithRoleCount_NoPasswordHash()
    {
        var response = await _factory.CreateAuthenticatedClient().GetAsync("/api/appusers");

        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("passwordHash", json, StringComparison.OrdinalIgnoreCase);

        var users = JsonSerializer.Deserialize<List<AppUser>>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
        Assert.Equal(["helen", "jenny"], users.Select(u => u.UserId));
        Assert.Equal(2, users.Single(u => u.UserId == "helen").RoleCount);
    }

    [Fact]
    public async Task Query_ByKeyword_FiltersUsers()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/appusers/query", new AppUserQuery { Keyword = "jen" });

        var users = await response.Content.ReadFromJsonAsync<List<AppUser>>();
        Assert.Equal(["jenny"], users!.Select(u => u.UserId));
    }

    [Fact]
    public async Task Query_ByIsActive_FiltersUsers()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/appusers/query", new AppUserQuery { IsActive = false });

        var users = await response.Content.ReadFromJsonAsync<List<AppUser>>();
        Assert.Equal(["jenny"], users!.Select(u => u.UserId));
    }

    [Fact]
    public async Task Query_ByRoleId_FiltersUsers()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/appusers/query", new AppUserQuery { RoleId = "Admin" });

        var users = await response.Content.ReadFromJsonAsync<List<AppUser>>();
        Assert.Equal(["helen"], users!.Select(u => u.UserId));
    }

    [Fact]
    public async Task Query_ByPasswordUpdatedRange_IsInclusive()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/appusers/query",
            new AppUserQuery { PasswordUpdatedFrom = new DateOnly(2026, 3, 5), PasswordUpdatedTo = new DateOnly(2026, 3, 5) });

        var users = await response.Content.ReadFromJsonAsync<List<AppUser>>();
        Assert.Equal(["jenny"], users!.Select(u => u.UserId));
    }

    [Fact]
    public async Task Query_EmptyFilter_ReturnsAll()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/appusers/query", new AppUserQuery());

        var users = await response.Content.ReadFromJsonAsync<List<AppUser>>();
        Assert.Equal(2, users!.Count);
    }

    // ---- view ----

    [Fact]
    public async Task GetById_Existing_ReturnsUserWithRoleIds()
    {
        var user = await _factory.CreateAuthenticatedClient().GetFromJsonAsync<AppUser>("/api/appusers/helen");

        Assert.Equal("Helen", user!.UserName);
        Assert.Equal(["Admin", "User"], user.RoleIds);
    }

    [Fact]
    public async Task GetById_Missing_Returns404()
    {
        var response = await _factory.CreateAuthenticatedClient().GetAsync("/api/appusers/nope");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- add ----

    [Fact]
    public async Task Create_ValidRequest_Returns201AndStoresDefaultPasswordHash()
    {
        var client = _factory.CreateAuthenticatedClient();

        var response = await client.PostAsJsonAsync("/api/appusers", NewRequest(" kevin "));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.EndsWith("/api/appusers/kevin", response.Headers.Location!.ToString());
        Assert.DoesNotContain("passwordHash", await response.Content.ReadAsStringAsync(), StringComparison.OrdinalIgnoreCase);

        var fetched = await client.GetFromJsonAsync<AppUser>("/api/appusers/kevin");
        Assert.Equal(["User"], fetched!.RoleIds);
        Assert.NotNull(fetched.PasswordUpdatedTime);
        Assert.Equal(DefaultHash, _repository.StoredHash("kevin"));
    }

    [Fact]
    public async Task Create_IgnoresClientSuppliedPasswordHash()
    {
        var client = _factory.CreateAuthenticatedClient();
        var body = new { userId = "mallory", userName = "Mallory", isActive = true, roleIds = Array.Empty<string>(), passwordHash = "attacker" };

        var response = await client.PostAsJsonAsync("/api/appusers", body);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal(DefaultHash, _repository.StoredHash("mallory"));
    }

    [Fact]
    public async Task Create_DuplicateUserId_Returns409()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/appusers", NewRequest("helen"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Create_MissingRequiredFields_Returns400()
    {
        var request = NewRequest();
        request.UserName = "";

        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/appusers", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- edit ----

    [Fact]
    public async Task Update_Existing_ChangesFieldsAndRoles_KeepsPasswordHash()
    {
        var client = _factory.CreateAuthenticatedClient();
        var request = new AppUserRequest { UserId = "jenny", UserName = "Jenny Lin", IsActive = true, RoleIds = ["Admin", "User", "User"] };

        var response = await client.PutAsJsonAsync("/api/appusers", request);

        response.EnsureSuccessStatusCode();
        var updated = await client.GetFromJsonAsync<AppUser>("/api/appusers/jenny");
        Assert.Equal("Jenny Lin", updated!.UserName);
        Assert.True(updated.IsActive);
        Assert.Equal(["Admin", "User"], updated.RoleIds);
        Assert.Equal(new DateTime(2026, 3, 5, 9, 30, 0, DateTimeKind.Utc), updated.PasswordUpdatedTime);
        Assert.Equal("seed-hash-jenny", _repository.StoredHash("jenny"));
    }

    [Fact]
    public async Task Update_IgnoresClientSuppliedPasswordHash()
    {
        var body = new { userId = "helen", userName = "Helen", isActive = true, roleIds = new[] { "Admin" }, passwordHash = "attacker" };

        var response = await _factory.CreateAuthenticatedClient().PutAsJsonAsync("/api/appusers", body);

        response.EnsureSuccessStatusCode();
        Assert.Equal("seed-hash-helen", _repository.StoredHash("helen"));
    }

    [Fact]
    public async Task Update_Missing_Returns404()
    {
        var response = await _factory.CreateAuthenticatedClient().PutAsJsonAsync("/api/appusers", NewRequest("nope"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- reset password ----

    [Fact]
    public async Task ResetPassword_Existing_StoresDefaultHashAndStampsTime()
    {
        var client = _factory.CreateAuthenticatedClient();
        var before = DateTime.UtcNow.AddSeconds(-1);

        var response = await client.PostAsync("/api/appusers/helen/reset-password", null);

        response.EnsureSuccessStatusCode();
        var user = await response.Content.ReadFromJsonAsync<AppUser>();
        Assert.Equal("helen", user!.UserId);
        Assert.True(user.PasswordUpdatedTime >= before);
        Assert.Equal(DefaultHash, _repository.StoredHash("helen"));
    }

    [Fact]
    public async Task ResetPassword_Missing_Returns404()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsync("/api/appusers/nope/reset-password", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- delete ----

    [Fact]
    public async Task Delete_Existing_Returns204ThenGone()
    {
        var client = _factory.CreateAuthenticatedClient();

        var response = await client.DeleteAsync("/api/appusers/jenny");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/appusers/jenny")).StatusCode);
    }

    [Fact]
    public async Task Delete_Missing_Returns404()
    {
        var response = await _factory.CreateAuthenticatedClient().DeleteAsync("/api/appusers/nope");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- lookups ----

    [Fact]
    public async Task Lookups_AppRoles_ReturnsRoles()
    {
        var roles = await _factory.CreateAuthenticatedClient().GetFromJsonAsync<List<AppRoleLookup>>("/api/lookups/approles");

        Assert.NotNull(roles);
        Assert.Equal(["Admin", "User"], roles.Select(r => r.RoleId));
        Assert.Equal("Administrator", roles[0].RoleName);
    }
}
