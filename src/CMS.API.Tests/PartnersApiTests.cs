using System.Net;
using System.Net.Http.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

public class PartnersApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public PartnersApiTests(WebApplicationFactory<Program> factory)
    {
        // Each test class instance gets its own fake repository (fresh data).
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IPartnerRepository>();
            services.AddSingleton<IPartnerRepository>(new FakePartnerRepository());
        }));
    }

    private static PartnerRequest NewRequest(short pkid = 0) => new()
    {
        Pkid = pkid,
        Name = "VMware",
        AppKey = "vmw",
        NameOnPartnerMenu = "VMware 虛擬化",
        NameOnCourseDetailPage = "VMware",
        DisplayOrder = 9,
        ImageFilename = "vmware.png",
    };

    // ---- list / filter ----

    [Fact]
    public async Task GetAll_ReturnsAllPartnersOrderedByDisplayOrder()
    {
        var partners = await _factory.CreateClient().GetFromJsonAsync<List<Partner>>("/api/partners");

        Assert.NotNull(partners);
        Assert.Equal([2, 1, 3], partners.Select(p => (int)p.Pkid));
        Assert.Equal("Cisco", partners[0].Name);
    }

    [Fact]
    public async Task Query_ByKeywordOnName_FiltersPartners()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/partners/query",
            new PartnerQuery { Keyword = "micro" });

        response.EnsureSuccessStatusCode();
        var partners = await response.Content.ReadFromJsonAsync<List<Partner>>();
        Assert.Equal([1], partners!.Select(p => (int)p.Pkid));
    }

    [Fact]
    public async Task Query_ByKeywordOnAppKey_FiltersPartners()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/partners/query",
            new PartnerQuery { Keyword = "csco" });

        var partners = await response.Content.ReadFromJsonAsync<List<Partner>>();
        Assert.Equal([2], partners!.Select(p => (int)p.Pkid));
    }

    [Fact]
    public async Task Query_ByKeywordOnMenuName_FiltersPartners()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/partners/query",
            new PartnerQuery { Keyword = "甲骨文" });

        var partners = await response.Content.ReadFromJsonAsync<List<Partner>>();
        Assert.Equal([3], partners!.Select(p => (int)p.Pkid));
    }

    [Fact]
    public async Task Query_EmptyFilter_ReturnsAllInDisplayOrder()
    {
        var response = await _factory.CreateClient().PostAsJsonAsync("/api/partners/query", new PartnerQuery());

        var partners = await response.Content.ReadFromJsonAsync<List<Partner>>();
        Assert.Equal([2, 1, 3], partners!.Select(p => (int)p.Pkid));
    }

    // ---- view ----

    [Fact]
    public async Task GetById_Existing_ReturnsPartner()
    {
        var partner = await _factory.CreateClient().GetFromJsonAsync<Partner>("/api/partners/2");

        Assert.Equal("Cisco", partner!.Name);
        Assert.Equal("csco", partner.AppKey);
        Assert.Null(partner.ImageFilename);
    }

    [Fact]
    public async Task GetById_Missing_Returns404()
    {
        var response = await _factory.CreateClient().GetAsync("/api/partners/99");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetById_NonNumeric_Returns404()
    {
        var response = await _factory.CreateClient().GetAsync("/api/partners/abc");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- add ----

    [Fact]
    public async Task Create_ValidRequest_Returns201WithGeneratedPkid()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/partners", NewRequest());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<Partner>();
        Assert.Equal(4, created!.Pkid);
        Assert.EndsWith("/api/partners/4", response.Headers.Location!.ToString());
        var fetched = await client.GetFromJsonAsync<Partner>("/api/partners/4");
        Assert.Equal("VMware", fetched!.Name);
        Assert.Equal(9, fetched.DisplayOrder);
    }

    [Fact]
    public async Task Create_TrimsTextAndStoresBlankImageAsNull()
    {
        var client = _factory.CreateClient();
        var request = NewRequest();
        request.Name = "  VMware  ";
        request.AppKey = " vmw ";
        request.ImageFilename = "   ";

        var response = await client.PostAsJsonAsync("/api/partners", request);

        response.EnsureSuccessStatusCode();
        var created = await response.Content.ReadFromJsonAsync<Partner>();
        Assert.Equal("VMware", created!.Name);
        Assert.Equal("vmw", created.AppKey);
        Assert.Null(created.ImageFilename);
    }

    [Fact]
    public async Task Create_MissingName_Returns400()
    {
        var request = NewRequest();
        request.Name = "";

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/partners", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_MissingAppKey_Returns400()
    {
        var request = NewRequest();
        request.AppKey = "";

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/partners", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_AppKeyTooLong_Returns400()
    {
        var request = NewRequest();
        request.AppKey = new string('x', 11);

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/partners", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_NameTooLong_Returns400()
    {
        var request = NewRequest();
        request.Name = new string('x', 51);

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/partners", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_MissingMenuName_Returns400()
    {
        var request = NewRequest();
        request.NameOnPartnerMenu = "";

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/partners", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- edit ----

    [Fact]
    public async Task Update_Existing_ChangesFields()
    {
        var client = _factory.CreateClient();
        var request = NewRequest(2);
        request.Name = "Cisco Systems";
        request.DisplayOrder = 5;
        request.ImageFilename = "cisco.png";

        var response = await client.PutAsJsonAsync("/api/partners", request);

        response.EnsureSuccessStatusCode();
        var updated = await client.GetFromJsonAsync<Partner>("/api/partners/2");
        Assert.Equal("Cisco Systems", updated!.Name);
        Assert.Equal(5, updated.DisplayOrder);
        Assert.Equal("cisco.png", updated.ImageFilename);
    }

    [Fact]
    public async Task Update_Missing_Returns404()
    {
        var response = await _factory.CreateClient().PutAsJsonAsync("/api/partners", NewRequest(99));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- delete ----

    [Fact]
    public async Task Delete_Existing_Returns204ThenGone()
    {
        var client = _factory.CreateClient();

        var response = await client.DeleteAsync("/api/partners/3");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/partners/3")).StatusCode);
    }

    [Fact]
    public async Task Delete_Missing_Returns404()
    {
        var response = await _factory.CreateClient().DeleteAsync("/api/partners/99");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- lookups ----

    [Fact]
    public async Task Lookups_Partners_ReturnsSlimListInDisplayOrder()
    {
        var lookups = await _factory.CreateClient()
            .GetFromJsonAsync<List<PartnerLookup>>("/api/lookups/partners");

        Assert.Equal(["Cisco", "Microsoft", "Oracle"], lookups!.Select(l => l.Name));
    }
}
