using System.Net;
using System.Net.Http.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

public class AppRolesApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public AppRolesApiTests(WebApplicationFactory<Program> factory)
    {
        // Each test class instance gets its own fake repository (fresh data).
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IAppRoleRepository>();
            services.AddSingleton<IAppRoleRepository>(new FakeAppRoleRepository());
        }));
    }

    private static AppRoleRequest NewRequest(string id = "Editor") => new()
    {
        RoleId = id, RoleName = "Editor", PermissionLevel = 50, Description = "Can edit", UserIds = ["jenny"],
    };

    // ---- list / filter ----

    [Fact]
    public async Task GetAll_ReturnsAllRolesWithUserCount()
    {
        var roles = await _factory.CreateClient().GetFromJsonAsync<List<AppRole>>("/api/approles");

        Assert.NotNull(roles);
        Assert.Equal(2, roles.Count);
        Assert.Equal(2, roles.Single(r => r.RoleId == "Admin").UserCount);
    }

    [Fact]
    public async Task Query_ByKeyword_FiltersRoles()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/approles/query", new AppRoleQuery { Keyword = "admin" });

        response.EnsureSuccessStatusCode();
        var roles = await response.Content.ReadFromJsonAsync<List<AppRole>>();
        Assert.Equal(["Admin"], roles!.Select(r => r.RoleId));
    }

    [Fact]
    public async Task Query_ByPermissionLevelRange_FiltersRoles()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/approles/query",
            new AppRoleQuery { MinPermissionLevel = 50, MaxPermissionLevel = 200 });

        var roles = await response.Content.ReadFromJsonAsync<List<AppRole>>();
        Assert.Equal(["User"], roles!.Select(r => r.RoleId));
    }

    [Fact]
    public async Task Query_EmptyFilter_ReturnsAll()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/approles/query", new AppRoleQuery());

        var roles = await response.Content.ReadFromJsonAsync<List<AppRole>>();
        Assert.Equal(2, roles!.Count);
    }

    // ---- view ----

    [Fact]
    public async Task GetById_Existing_ReturnsRoleWithUserIds()
    {
        var role = await _factory.CreateClient().GetFromJsonAsync<AppRole>("/api/approles/Admin");

        Assert.Equal("Administrator", role!.RoleName);
        Assert.Equal(["helen", "jenny"], role.UserIds);
    }

    [Fact]
    public async Task GetById_Missing_Returns404()
    {
        var response = await _factory.CreateClient().GetAsync("/api/approles/Nope");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- add ----

    [Fact]
    public async Task Create_ValidRequest_Returns201AndPersists()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/approles", NewRequest());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.EndsWith("/api/approles/Editor", response.Headers.Location!.ToString());
        var fetched = await client.GetFromJsonAsync<AppRole>("/api/approles/Editor");
        Assert.Equal(["jenny"], fetched!.UserIds);
    }

    [Fact]
    public async Task Create_DuplicateRoleId_Returns409()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/approles", NewRequest("Admin"));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Create_MissingRequiredFields_Returns400()
    {
        var request = NewRequest();
        request.RoleName = "";

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/approles", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- edit ----

    [Fact]
    public async Task Update_Existing_ChangesFieldsAndUsers()
    {
        var client = _factory.CreateClient();
        var request = NewRequest("User");
        request.RoleName = "Standard User";
        request.UserIds = ["helen", "jenny"];

        var response = await client.PutAsJsonAsync("/api/approles", request);

        response.EnsureSuccessStatusCode();
        var updated = await client.GetFromJsonAsync<AppRole>("/api/approles/User");
        Assert.Equal("Standard User", updated!.RoleName);
        Assert.Equal(50, updated.PermissionLevel);
        Assert.Equal(["helen", "jenny"], updated.UserIds);
    }

    [Fact]
    public async Task Update_Missing_Returns404()
    {
        var response = await _factory.CreateClient().PutAsJsonAsync("/api/approles", NewRequest("Nope"));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- delete ----

    [Fact]
    public async Task Delete_Existing_Returns204ThenGone()
    {
        var client = _factory.CreateClient();

        var response = await client.DeleteAsync("/api/approles/User");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/approles/User")).StatusCode);
    }

    [Fact]
    public async Task Delete_Missing_Returns404()
    {
        var response = await _factory.CreateClient().DeleteAsync("/api/approles/Nope");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- lookups ----

    [Fact]
    public async Task Lookups_AppUsers_ReturnsUsers()
    {
        var users = await _factory.CreateClient().GetFromJsonAsync<List<AppUserLookup>>("/api/lookups/appusers");

        Assert.Equal(["helen", "jenny"], users!.Select(u => u.UserId));
    }
}
