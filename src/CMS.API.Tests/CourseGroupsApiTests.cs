using System.Net;
using System.Net.Http.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

public class CourseGroupsApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeCourseGroupRepository _repository = new();

    public CourseGroupsApiTests(WebApplicationFactory<Program> factory)
    {
        // Each test class instance gets its own fake repository (fresh data).
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<ICourseGroupRepository>();
            services.AddSingleton<ICourseGroupRepository>(_repository);
        }));
    }

    private static CourseGroupRequest NewRequest(short pkid = 0) => new()
    {
        Pkid = pkid,
        Description = "線上課程",
    };

    // ---- list / filter ----

    [Fact]
    public async Task GetAll_ReturnsAllGroupsOrderedByPkid()
    {
        var groups = await _factory.CreateClient().GetFromJsonAsync<List<CourseGroup>>("/api/coursegroups");

        Assert.NotNull(groups);
        Assert.Equal([1, 2, 3], groups.Select(g => (int)g.Pkid));
        Assert.Equal("基礎課程", groups[0].Description);
    }

    [Fact]
    public async Task Query_ByKeyword_FiltersOnDescription()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/coursegroups/query",
            new CourseGroupQuery { Keyword = "進階" });

        response.EnsureSuccessStatusCode();
        var groups = await response.Content.ReadFromJsonAsync<List<CourseGroup>>();
        Assert.Equal([2], groups!.Select(g => (int)g.Pkid));
    }

    [Fact]
    public async Task Query_EmptyFilter_ReturnsAllInPkidOrder()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/coursegroups/query", new CourseGroupQuery());

        var groups = await response.Content.ReadFromJsonAsync<List<CourseGroup>>();
        Assert.Equal([1, 2, 3], groups!.Select(g => (int)g.Pkid));
    }

    // ---- view ----

    [Fact]
    public async Task GetById_Existing_ReturnsGroup()
    {
        var group = await _factory.CreateClient().GetFromJsonAsync<CourseGroup>("/api/coursegroups/2");

        Assert.Equal(2, group!.Pkid);
        Assert.Equal("進階課程", group.Description);
    }

    [Fact]
    public async Task GetById_Missing_Returns404()
    {
        var response = await _factory.CreateClient().GetAsync("/api/coursegroups/99");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetById_NonNumeric_Returns404()
    {
        var response = await _factory.CreateClient().GetAsync("/api/coursegroups/abc");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- add ----

    [Fact]
    public async Task Create_ValidRequest_Returns201WithGeneratedPkid()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/coursegroups", NewRequest());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<CourseGroup>();
        Assert.Equal(4, created!.Pkid);
        Assert.EndsWith("/api/coursegroups/4", response.Headers.Location!.ToString());
        var fetched = await client.GetFromJsonAsync<CourseGroup>("/api/coursegroups/4");
        Assert.Equal("線上課程", fetched!.Description);
    }

    [Fact]
    public async Task Create_TrimsDescription()
    {
        var request = NewRequest();
        request.Description = "  線上課程  ";

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/coursegroups", request);

        response.EnsureSuccessStatusCode();
        var created = await response.Content.ReadFromJsonAsync<CourseGroup>();
        Assert.Equal("線上課程", created!.Description);
    }

    [Fact]
    public async Task Create_MissingDescription_Returns400()
    {
        var request = NewRequest();
        request.Description = "";

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/coursegroups", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_DescriptionTooLong_Returns400()
    {
        var request = NewRequest();
        request.Description = new string('x', 101);

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/coursegroups", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- edit ----

    [Fact]
    public async Task Update_Existing_ChangesDescription()
    {
        var client = _factory.CreateClient();
        var request = NewRequest(2);
        request.Description = "進階實務課程";

        var response = await client.PutAsJsonAsync("/api/coursegroups", request);

        response.EnsureSuccessStatusCode();
        var updated = await client.GetFromJsonAsync<CourseGroup>("/api/coursegroups/2");
        Assert.Equal("進階實務課程", updated!.Description);
    }

    [Fact]
    public async Task Update_Missing_Returns404()
    {
        var response = await _factory.CreateClient().PutAsJsonAsync("/api/coursegroups", NewRequest(99));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- delete ----

    [Fact]
    public async Task Delete_Existing_Returns204ThenGone()
    {
        var client = _factory.CreateClient();

        var response = await client.DeleteAsync("/api/coursegroups/3");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/coursegroups/3")).StatusCode);
    }

    [Fact]
    public async Task Delete_Missing_Returns404()
    {
        var response = await _factory.CreateClient().DeleteAsync("/api/coursegroups/99");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Delete_InUse_Returns409AndKeepsRow()
    {
        // FK_Course_CourseGroup is ON DELETE CASCADE, so the API must refuse before deleting.
        _repository.InUsePkids.Add(1);
        var client = _factory.CreateClient();

        var response = await client.DeleteAsync("/api/coursegroups/1");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/coursegroups/1")).StatusCode);
    }

    // ---- lookups ----

    [Fact]
    public async Task Lookups_CourseGroups_ReturnsSlimListInPkidOrder()
    {
        var lookups = await _factory.CreateClient()
            .GetFromJsonAsync<List<CourseGroupLookup>>("/api/lookups/coursegroups");

        Assert.Equal(["基礎課程", "進階課程", "認證課程"], lookups!.Select(l => l.Description));
    }
}
