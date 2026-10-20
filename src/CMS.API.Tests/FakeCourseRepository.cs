using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Tests;

public class FakeCourseRepository : ICourseRepository
{
    private static readonly PartnerLookup Microsoft = new() { Pkid = 1, Name = "Microsoft" };
    private static readonly PartnerLookup Cisco = new() { Pkid = 2, Name = "Cisco" };
    private static readonly CourseGroupLookup Basic = new() { Pkid = 10, Description = "基礎課程" };
    private static readonly PublishStatusLookup Published = new() { Pkid = 1, Description = "已發布" };
    private static readonly PublishStatusLookup Draft = new() { Pkid = 2, Description = "草稿" };

    private readonly List<CertificationLookup> _certifications =
    [
        new() { Pkid = 100, Title = "AZ-900", PartnerPkid = 1 },
        new() { Pkid = 101, Title = "CCNA", PartnerPkid = 2 },
    ];

    private readonly List<JobCategoryLookup> _jobCategories =
    [
        new() { Pkid = 5, Description = "系統工程 System Engineer" },
        new() { Pkid = 6, Description = "雲端技術 Cloud" },
    ];

    // DisplayOrder deliberately differs from pkid order so ordering is observable.
    private readonly List<Course> _courses =
    [
        new()
        {
            Pkid = 1, Title = "Azure 基礎", OfficialTitle = "Azure Fundamentals", CourseId = "AZ900", ProdCourseId = "AZ-900T00",
            FriendlyUrl = "azure-fundamentals", DisplayOrder = 2, PartnerPkid = 1, CourseGroupPkid = 10, PublishStatusPkid = 1,
            ScheduleOn = new DateOnly(2026, 1, 1), ScheduleOff = new DateOnly(2036, 1, 1), Hour = 8, ListPrice = 6000,
            LearningCredit = 12.5m, CanRepeat = true, Partner = Microsoft, CourseGroup = Basic, PublishStatus = Published,
            CertificationPkids = [100], JobCategoryPkids = [5, 6],
        },
        new()
        {
            Pkid = 2, Title = "CCNA 網路", CourseId = "CCNA", ProdCourseId = "CCNA-01", FriendlyUrl = "ccna",
            DisplayOrder = 1, PartnerPkid = 2, CourseGroupPkid = null, PublishStatusPkid = 1,
            ScheduleOn = new DateOnly(2026, 3, 1), ScheduleOff = new DateOnly(2036, 3, 1), Hour = 40, ListPrice = 30000,
            LearningCredit = 60, CanRepeat = false, Partner = Cisco, CourseGroup = null, PublishStatus = Published,
            CertificationPkids = [101], JobCategoryPkids = [5],
        },
        new()
        {
            Pkid = 3, Title = "Windows Server", CourseId = "WS2022", ProdCourseId = "WS-2022", FriendlyUrl = "windows-server",
            DisplayOrder = 3, PartnerPkid = 1, CourseGroupPkid = 10, PublishStatusPkid = 2,
            ScheduleOn = new DateOnly(2026, 6, 1), ScheduleOff = new DateOnly(2036, 6, 1), Hour = 16, ListPrice = 12000,
            LearningCredit = 24, CanRepeat = false, Partner = Microsoft, CourseGroup = Basic, PublishStatus = Draft,
        },
    ];

    private static Course Clone(Course c, bool withLinks) => new()
    {
        Pkid = c.Pkid, Title = c.Title, OfficialTitle = c.OfficialTitle, CourseId = c.CourseId, ProdCourseId = c.ProdCourseId,
        FriendlyUrl = c.FriendlyUrl, DisplayOrder = c.DisplayOrder, PartnerPkid = c.PartnerPkid, CourseGroupPkid = c.CourseGroupPkid,
        PublishStatusPkid = c.PublishStatusPkid, ScheduleOn = c.ScheduleOn, ScheduleOff = c.ScheduleOff, Hour = c.Hour,
        ListPrice = c.ListPrice, LearningCredit = c.LearningCredit, Material = c.Material, Objective = c.Objective,
        Target = c.Target, Prerequisites = c.Prerequisites, Outline = c.Outline, TowardCertOrExam = c.TowardCertOrExam,
        Note = c.Note, OtherInfo = c.OtherInfo, CanRepeat = c.CanRepeat,
        CertificationCount = c.CertificationPkids.Count, JobCategoryCount = c.JobCategoryPkids.Count,
        Partner = c.Partner, CourseGroup = c.CourseGroup, PublishStatus = c.PublishStatus,
        CertificationPkids = withLinks ? [.. c.CertificationPkids] : [],
        JobCategoryPkids = withLinks ? [.. c.JobCategoryPkids] : [],
    };

    private static IEnumerable<Course> Ordered(IEnumerable<Course> source) =>
        source.OrderBy(c => c.DisplayOrder).ThenBy(c => c.Pkid);

    public Task<IEnumerable<Course>> GetAllAsync() =>
        Task.FromResult(Ordered(_courses).Select(c => Clone(c, false)).ToList().AsEnumerable());

    public Task<IEnumerable<Course>> QueryAsync(CourseQuery q)
    {
        var result = _courses.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(q.Keyword))
        {
            var k = q.Keyword.Trim();
            result = result.Where(c =>
                c.Title.Contains(k, StringComparison.OrdinalIgnoreCase)
                || (c.OfficialTitle?.Contains(k, StringComparison.OrdinalIgnoreCase) ?? false)
                || c.CourseId.Contains(k, StringComparison.OrdinalIgnoreCase)
                || c.ProdCourseId.Contains(k, StringComparison.OrdinalIgnoreCase)
                || c.FriendlyUrl.Contains(k, StringComparison.OrdinalIgnoreCase));
        }
        if (q.PartnerPkid.HasValue) result = result.Where(c => c.PartnerPkid == q.PartnerPkid);
        if (q.CourseGroupPkid.HasValue) result = result.Where(c => c.CourseGroupPkid == q.CourseGroupPkid);
        if (q.PublishStatusPkid.HasValue) result = result.Where(c => c.PublishStatusPkid == q.PublishStatusPkid);
        if (q.CanRepeat.HasValue) result = result.Where(c => c.CanRepeat == q.CanRepeat);
        if (q.ScheduleOnFrom.HasValue) result = result.Where(c => c.ScheduleOn >= q.ScheduleOnFrom);
        if (q.ScheduleOnTo.HasValue) result = result.Where(c => c.ScheduleOn <= q.ScheduleOnTo);
        if (q.ScheduleOffFrom.HasValue) result = result.Where(c => c.ScheduleOff >= q.ScheduleOffFrom);
        if (q.ScheduleOffTo.HasValue) result = result.Where(c => c.ScheduleOff <= q.ScheduleOffTo);
        return Task.FromResult(Ordered(result).Select(c => Clone(c, false)).ToList().AsEnumerable());
    }

    public Task<Course?> GetByIdAsync(int pkid) =>
        Task.FromResult(_courses.Where(c => c.Pkid == pkid).Select(c => Clone(c, true)).FirstOrDefault());

    public Task<Course> CreateAsync(CourseRequest request)
    {
        var course = new Course { Pkid = _courses.Count == 0 ? 1 : _courses.Max(c => c.Pkid) + 1 };
        Apply(course, request);
        _courses.Add(course);
        return Task.FromResult(Clone(course, true));
    }

    public Task<Course?> UpdateAsync(CourseRequest request)
    {
        var course = _courses.FirstOrDefault(c => c.Pkid == request.Pkid);
        if (course is null) return Task.FromResult<Course?>(null);
        Apply(course, request);
        return Task.FromResult<Course?>(Clone(course, true));
    }

    public Task<bool> DeleteAsync(int pkid) => Task.FromResult(_courses.RemoveAll(c => c.Pkid == pkid) > 0);

    public Task<IEnumerable<CertificationLookup>> GetCertificationLookupsAsync() =>
        Task.FromResult(_certifications.OrderBy(c => c.Title).ToList().AsEnumerable());

    public Task<IEnumerable<JobCategoryLookup>> GetJobCategoryLookupsAsync() =>
        Task.FromResult(_jobCategories.OrderBy(j => j.Pkid).ToList().AsEnumerable());

    private static void Apply(Course course, CourseRequest r)
    {
        course.Title = r.Title; course.OfficialTitle = r.OfficialTitle; course.CourseId = r.CourseId;
        course.ProdCourseId = r.ProdCourseId; course.FriendlyUrl = r.FriendlyUrl; course.DisplayOrder = r.DisplayOrder;
        course.PartnerPkid = r.PartnerPkid; course.CourseGroupPkid = r.CourseGroupPkid; course.PublishStatusPkid = r.PublishStatusPkid;
        course.ScheduleOn = r.ScheduleOn; course.ScheduleOff = r.ScheduleOff; course.Hour = r.Hour;
        course.ListPrice = r.ListPrice; course.LearningCredit = r.LearningCredit; course.Material = r.Material;
        course.Objective = r.Objective; course.Target = r.Target; course.Prerequisites = r.Prerequisites;
        course.Outline = r.Outline; course.TowardCertOrExam = r.TowardCertOrExam; course.Note = r.Note;
        course.OtherInfo = r.OtherInfo; course.CanRepeat = r.CanRepeat;
        course.CertificationPkids = [.. r.CertificationPkids];
        course.JobCategoryPkids = [.. r.JobCategoryPkids];
        course.Partner = r.PartnerPkid == 2 ? Cisco : Microsoft;
        course.CourseGroup = r.CourseGroupPkid == 10 ? Basic : null;
        course.PublishStatus = r.PublishStatusPkid == 2 ? Draft : Published;
    }
}
