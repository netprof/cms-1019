using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Tests;

public class FakeCourseGroupRepository : ICourseGroupRepository
{
    private readonly List<CourseGroup> _groups =
    [
        new() { Pkid = 1, Description = "基礎課程" },
        new() { Pkid = 2, Description = "進階課程" },
        new() { Pkid = 3, Description = "認證課程" },
    ];

    /// <summary>Pkids that are "referenced" by Course / PartnerCourseGroup rows.</summary>
    public HashSet<short> InUsePkids { get; } = [];

    private static CourseGroup Clone(CourseGroup g) => new() { Pkid = g.Pkid, Description = g.Description };

    private static IEnumerable<CourseGroup> Ordered(IEnumerable<CourseGroup> source) =>
        source.OrderBy(g => g.Pkid);

    public Task<IEnumerable<CourseGroup>> GetAllAsync() =>
        Task.FromResult(Ordered(_groups).Select(Clone).ToList().AsEnumerable());

    public Task<IEnumerable<CourseGroup>> QueryAsync(CourseGroupQuery q)
    {
        var result = _groups.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(q.Keyword))
        {
            var k = q.Keyword.Trim();
            result = result.Where(g => g.Description.Contains(k, StringComparison.OrdinalIgnoreCase));
        }
        return Task.FromResult(Ordered(result).Select(Clone).ToList().AsEnumerable());
    }

    public Task<CourseGroup?> GetByIdAsync(short pkid) =>
        Task.FromResult(_groups.Where(g => g.Pkid == pkid).Select(Clone).FirstOrDefault());

    public Task<CourseGroup> CreateAsync(CourseGroupRequest request)
    {
        var group = new CourseGroup
        {
            Pkid = (short)(_groups.Count == 0 ? 1 : _groups.Max(g => g.Pkid) + 1),
            Description = request.Description,
        };
        _groups.Add(group);
        return Task.FromResult(Clone(group));
    }

    public Task<CourseGroup?> UpdateAsync(CourseGroupRequest request)
    {
        var group = _groups.FirstOrDefault(g => g.Pkid == request.Pkid);
        if (group is null) return Task.FromResult<CourseGroup?>(null);
        group.Description = request.Description;
        return Task.FromResult<CourseGroup?>(Clone(group));
    }

    public Task<bool> IsInUseAsync(short pkid) => Task.FromResult(InUsePkids.Contains(pkid));

    public Task<bool> DeleteAsync(short pkid) => Task.FromResult(_groups.RemoveAll(g => g.Pkid == pkid) > 0);

    public Task<IEnumerable<CourseGroupLookup>> GetLookupsAsync() =>
        Task.FromResult(Ordered(_groups)
            .Select(g => new CourseGroupLookup { Pkid = g.Pkid, Description = g.Description })
            .ToList().AsEnumerable());
}
