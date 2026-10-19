using System.Net;
using System.Net.Http.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

public class CoursesApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public CoursesApiTests(WebApplicationFactory<Program> factory)
    {
        // Each test class instance gets its own fake repository (fresh data).
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<ICourseRepository>();
            services.AddSingleton<ICourseRepository>(new FakeCourseRepository());
        }));
    }

    private static CourseRequest NewRequest(int pkid = 0) => new()
    {
        Pkid = pkid,
        Title = "SQL Server 管理",
        OfficialTitle = "Administering SQL Server",
        CourseId = "SQL01",
        ProdCourseId = "SQL-ADMIN",
        FriendlyUrl = "sql-server-admin",
        DisplayOrder = 9,
        PartnerPkid = 1,
        CourseGroupPkid = 10,
        PublishStatusPkid = 1,
        ScheduleOn = new DateOnly(2026, 9, 1),
        ScheduleOff = new DateOnly(2036, 9, 1),
        Hour = 24,
        ListPrice = 18000,
        LearningCredit = 36.5m,
        Material = "原廠教材",
        CanRepeat = true,
        CertificationPkids = [100, 101],
        JobCategoryPkids = [6],
    };

    private static async Task<List<Course>> QueryAsync(HttpClient client, CourseQuery query)
    {
        var response = await client.PostAsJsonAsync("/api/courses/query", query);
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<List<Course>>())!;
    }

    // ---- list / filter ----

    [Fact]
    public async Task GetAll_ReturnsCoursesOrderedByDisplayOrderWithNavObjects()
    {
        var courses = await _factory.CreateClient().GetFromJsonAsync<List<Course>>("/api/courses");

        Assert.NotNull(courses);
        Assert.Equal([2, 1, 3], courses.Select(c => c.Pkid));
        Assert.Equal("Cisco", courses[0].Partner.Name);
        Assert.Null(courses[0].CourseGroup);
        Assert.Equal("基礎課程", courses[1].CourseGroup!.Description);
        Assert.Equal("已發布", courses[1].PublishStatus.Description);
        Assert.Equal(1, courses[1].CertificationCount);
        Assert.Equal(2, courses[1].JobCategoryCount);
    }

    [Fact]
    public async Task Query_ByKeywordOnTitle_Filters()
    {
        var courses = await QueryAsync(_factory.CreateClient(), new CourseQuery { Keyword = "azure" });

        Assert.Equal([1], courses.Select(c => c.Pkid));
    }

    [Fact]
    public async Task Query_ByKeywordOnCourseId_Filters()
    {
        var courses = await QueryAsync(_factory.CreateClient(), new CourseQuery { Keyword = "ws2022" });

        Assert.Equal([3], courses.Select(c => c.Pkid));
    }

    [Fact]
    public async Task Query_ByPartner_Filters()
    {
        var courses = await QueryAsync(_factory.CreateClient(), new CourseQuery { PartnerPkid = 1 });

        Assert.Equal([1, 3], courses.Select(c => c.Pkid));
    }

    [Fact]
    public async Task Query_ByCourseGroup_Filters()
    {
        var courses = await QueryAsync(_factory.CreateClient(), new CourseQuery { CourseGroupPkid = 10 });

        Assert.Equal([1, 3], courses.Select(c => c.Pkid));
    }

    [Fact]
    public async Task Query_ByPublishStatus_Filters()
    {
        var courses = await QueryAsync(_factory.CreateClient(), new CourseQuery { PublishStatusPkid = 2 });

        Assert.Equal([3], courses.Select(c => c.Pkid));
    }

    [Fact]
    public async Task Query_ByCanRepeat_Filters()
    {
        var courses = await QueryAsync(_factory.CreateClient(), new CourseQuery { CanRepeat = false });

        Assert.Equal([2, 3], courses.Select(c => c.Pkid));
    }

    [Fact]
    public async Task Query_ByScheduleOnRange_IsInclusive()
    {
        var courses = await QueryAsync(_factory.CreateClient(), new CourseQuery
        {
            ScheduleOnFrom = new DateOnly(2026, 3, 1),
            ScheduleOnTo = new DateOnly(2026, 6, 1),
        });

        Assert.Equal([2, 3], courses.Select(c => c.Pkid));
    }

    [Fact]
    public async Task Query_ByScheduleOffRange_Filters()
    {
        var courses = await QueryAsync(_factory.CreateClient(), new CourseQuery
        {
            ScheduleOffTo = new DateOnly(2036, 2, 1),
        });

        Assert.Equal([1], courses.Select(c => c.Pkid));
    }

    [Fact]
    public async Task Query_EmptyFilter_ReturnsAll()
    {
        var courses = await QueryAsync(_factory.CreateClient(), new CourseQuery());

        Assert.Equal([2, 1, 3], courses.Select(c => c.Pkid));
    }

    // ---- view ----

    [Fact]
    public async Task GetById_Existing_ReturnsCourseWithLinkIds()
    {
        var course = await _factory.CreateClient().GetFromJsonAsync<Course>("/api/courses/1");

        Assert.Equal("Azure 基礎", course!.Title);
        Assert.Equal(new DateOnly(2026, 1, 1), course.ScheduleOn);
        Assert.Equal(12.5m, course.LearningCredit);
        Assert.Equal([100], course.CertificationPkids);
        Assert.Equal([5, 6], course.JobCategoryPkids.Select(x => (int)x));
    }

    [Fact]
    public async Task GetById_Missing_Returns404()
    {
        var response = await _factory.CreateClient().GetAsync("/api/courses/99");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetById_NonNumeric_Returns404()
    {
        var response = await _factory.CreateClient().GetAsync("/api/courses/abc");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- add ----

    [Fact]
    public async Task Create_ValidRequest_Returns201WithLinks()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/courses", NewRequest());

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<Course>();
        Assert.Equal(4, created!.Pkid);
        Assert.EndsWith("/api/courses/4", response.Headers.Location!.ToString());
        var fetched = await client.GetFromJsonAsync<Course>("/api/courses/4");
        Assert.Equal("SQL Server 管理", fetched!.Title);
        Assert.Equal([100, 101], fetched.CertificationPkids);
        Assert.Equal([6], fetched.JobCategoryPkids.Select(x => (int)x));
        Assert.Equal("Microsoft", fetched.Partner.Name);
    }

    [Fact]
    public async Task Create_TrimsTextAndStoresBlankOptionalsAsNull()
    {
        var request = NewRequest();
        request.Title = "  SQL  ";
        request.CourseId = " SQL01 ";
        request.OfficialTitle = "   ";
        request.Material = "";
        request.CertificationPkids = [100, 100];

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/courses", request);

        response.EnsureSuccessStatusCode();
        var created = await response.Content.ReadFromJsonAsync<Course>();
        Assert.Equal("SQL", created!.Title);
        Assert.Equal("SQL01", created.CourseId);
        Assert.Null(created.OfficialTitle);
        Assert.Null(created.Material);
        Assert.Equal([100], created.CertificationPkids);
    }

    [Fact]
    public async Task Create_MissingTitle_Returns400()
    {
        var request = NewRequest();
        request.Title = "";

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/courses", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_CourseIdTooLong_Returns400()
    {
        var request = NewRequest();
        request.CourseId = new string('x', 51);

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/courses", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_MissingPartner_Returns400()
    {
        var request = NewRequest();
        request.PartnerPkid = 0;

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/courses", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Create_ScheduleOffBeforeScheduleOn_Returns400()
    {
        var request = NewRequest();
        request.ScheduleOff = request.ScheduleOn.AddDays(-1);

        var response = await _factory.CreateClient().PostAsJsonAsync("/api/courses", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- edit ----

    [Fact]
    public async Task Update_Existing_ChangesFieldsAndLinks()
    {
        var client = _factory.CreateClient();
        var request = NewRequest(2);
        request.Title = "CCNA 進階";
        request.PartnerPkid = 2;
        request.CourseGroupPkid = null;
        request.CertificationPkids = [];
        request.JobCategoryPkids = [5, 6];

        var response = await client.PutAsJsonAsync("/api/courses", request);

        response.EnsureSuccessStatusCode();
        var updated = await client.GetFromJsonAsync<Course>("/api/courses/2");
        Assert.Equal("CCNA 進階", updated!.Title);
        Assert.Null(updated.CourseGroup);
        Assert.Empty(updated.CertificationPkids);
        Assert.Equal([5, 6], updated.JobCategoryPkids.Select(x => (int)x));
    }

    [Fact]
    public async Task Update_Missing_Returns404()
    {
        var response = await _factory.CreateClient().PutAsJsonAsync("/api/courses", NewRequest(99));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Update_ScheduleOffBeforeScheduleOn_Returns400()
    {
        var request = NewRequest(2);
        request.ScheduleOff = request.ScheduleOn.AddDays(-1);

        var response = await _factory.CreateClient().PutAsJsonAsync("/api/courses", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // ---- delete ----

    [Fact]
    public async Task Delete_Existing_Returns204ThenGone()
    {
        var client = _factory.CreateClient();

        var response = await client.DeleteAsync("/api/courses/3");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/api/courses/3")).StatusCode);
    }

    [Fact]
    public async Task Delete_Missing_Returns404()
    {
        var response = await _factory.CreateClient().DeleteAsync("/api/courses/99");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ---- lookups ----

    [Fact]
    public async Task Lookups_Certifications_ReturnsSlimListOrderedByTitle()
    {
        var lookups = await _factory.CreateClient()
            .GetFromJsonAsync<List<CertificationLookup>>("/api/lookups/certifications");

        Assert.Equal(["AZ-900", "CCNA"], lookups!.Select(l => l.Title));
        Assert.Equal(1, lookups[0].PartnerPkid);
    }

    [Fact]
    public async Task Lookups_JobCategories_ReturnsSlimListOrderedByPkid()
    {
        var lookups = await _factory.CreateClient()
            .GetFromJsonAsync<List<JobCategoryLookup>>("/api/lookups/jobcategories");

        Assert.Equal([5, 6], lookups!.Select(l => (int)l.Pkid));
    }
}
