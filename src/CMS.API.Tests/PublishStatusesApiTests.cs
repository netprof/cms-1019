using System.Net;
using System.Net.Http.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

public class PublishStatusesApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public PublishStatusesApiTests(WebApplicationFactory<Program> factory)
    {
        // Each test class instance gets its own fake repository (fresh data).
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IPublishStatusRepository>();
            services.AddSingleton<IPublishStatusRepository>(new FakePublishStatusRepository());
        }));
    }

    private static PublishStatusRequest NewRequest(byte pkid = 9) => new()
    {
        Pkid = pkid, Description = "審核中", IsDraft = true, IsPublished = false, IsDiscontinued = false,
    };

    // ---- list / filter ----

    [Fact]
    public async Task GetAll_ReturnsAllStatusesOrderedByPkid()
    {
        var statuses = await _factory.CreateClient().GetFromJsonAsync<List<PublishStatus>>("/api/publishstatuses");

        Assert.NotNull(statuses);
        Assert.Equal([1, 2, 3], statuses.Select(s => (int)s.Pkid));
        Assert.Equal("已發布", statuses[1].Description);
    }

    [Fact]
    public async Task Query_ByKeyword_FiltersStatuses()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/publishstatuses/query",
            new PublishStatusQuery { Keyword = "停用" });

        response.EnsureSuccessStatusCode();
        var statuses = await response.Content.ReadFromJsonAsync<List<PublishStatus>>();
        Assert.Equal([3], statuses!.Select(s => (int)s.Pkid));
    }

    [Fact]
    public async Task Query_ByIsPublished_FiltersStatuses()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/publishstatuses/query",
            new PublishStatusQuery { IsPublished = true });

        var statuses = await response.Content.ReadFromJsonAsync<List<PublishStatus>>();
        Assert.Equal([2], statuses!.Select(s => (int)s.Pkid));
    }

    [Fact]
    public async Task Query_ByIsDraftFalse_FiltersStatuses()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/publishstatuses/query",
            new PublishStatusQuery { IsDraft = false });

        var statuses = await response.Content.ReadFromJsonAsync<List<PublishStatus>>();
        Assert.Equal([2, 3], statuses!.Select(s => (int)s.Pkid));
    }

    [Fact]
    public async Task Query_EmptyFilter_ReturnsAll()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/publishstatuses/query", new PublishStatusQuery());

        var statuses = await response.Content.ReadFromJsonAsync<List<PublishStatus>>();
        Assert.Equal(3, statuses!.Count);
    }

    // ---- view ----

    [Fact]
    public async Task GetById_Existing_ReturnsStatus()
    {
        var status = await _factory.CreateClient().GetFromJsonAsync<PublishStatus>("/api/publishstatuses/2");

        Assert.Equal("已發布", status!.Description);
        Assert.True(status.IsPublished);
        Assert.False(status.IsDraft);
    }

    [Fact]
    public async Task GetById_Missing_Returns404()
    {
        var response = await _factory.CreateClient().GetAsync("/api/publishstatuses/99");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetById_NonNumeric_Returns404()
    {
        var response = await _factory.CreateClient().GetAsync("/api/publishstatuses/abc");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- add ----

    [Fact]
    public async Task Create_ValidRequest_Returns201AndPersists()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/publishstatuses", NewRequest());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.EndsWith("/api/publishstatuses/9", response.Headers.Location!.ToString());
        var fetched = await client.GetFromJsonAsync<PublishStatus>("/api/publishstatuses/9");
        Assert.Equal("審核中", fetched!.Description);
        Assert.True(fetched.IsDraft);
    }

    [Fact]
    public async Task Create_DuplicatePkid_Returns409()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/publishstatuses", NewRequest(1));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Create_MissingDescription_Returns400()
    {
        var request = NewRequest();
        request.Description = "";

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/publishstatuses", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_DescriptionTooLong_Returns400()
    {
        var request = NewRequest();
        request.Description = new string('x', 51);

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/publishstatuses", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_PkidOutOfTinyintRange_Returns400()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/publishstatuses",
            new { pkid = 300, description = "x", isDraft = false, isPublished = false, isDiscontinued = false });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- edit ----

    [Fact]
    public async Task Update_Existing_ChangesFields()
    {
        var client = _factory.CreateClient();
        var request = NewRequest(2);
        request.Description = "公開";
        request.IsPublished = true;
        request.IsDiscontinued = true;

        var response = await client.PutAsJsonAsync("/api/publishstatuses", request);

        response.EnsureSuccessStatusCode();
        var updated = await client.GetFromJsonAsync<PublishStatus>("/api/publishstatuses/2");
        Assert.Equal("公開", updated!.Description);
        Assert.True(updated.IsPublished);
        Assert.True(updated.IsDiscontinued);
    }

    [Fact]
    public async Task Update_Missing_Returns404()
    {
        var response = await _factory.CreateClient().PutAsJsonAsync("/api/publishstatuses", NewRequest(99));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- delete ----

    [Fact]
    public async Task Delete_Existing_Returns204ThenGone()
    {
        var client = _factory.CreateClient();

        var response = await client.DeleteAsync("/api/publishstatuses/3");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/publishstatuses/3")).StatusCode);
    }

    [Fact]
    public async Task Delete_Missing_Returns404()
    {
        var response = await _factory.CreateClient().DeleteAsync("/api/publishstatuses/99");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- lookups ----

    [Fact]
    public async Task Lookups_PublishStatuses_ReturnsSlimList()
    {
        var lookups = await _factory.CreateClient()
            .GetFromJsonAsync<List<PublishStatusLookup>>("/api/lookups/publishstatuses");

        Assert.Equal(["草稿", "已發布", "已停用"], lookups!.Select(l => l.Description));
    }
}
