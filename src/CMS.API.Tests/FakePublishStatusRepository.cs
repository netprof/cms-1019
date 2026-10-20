using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Tests;

public class FakePublishStatusRepository : IPublishStatusRepository
{
    private readonly List<PublishStatus> _statuses =
    [
        new() { Pkid = 1, Description = "草稿", IsDraft = true, IsPublished = false, IsDiscontinued = false },
        new() { Pkid = 2, Description = "已發布", IsDraft = false, IsPublished = true, IsDiscontinued = false },
        new() { Pkid = 3, Description = "已停用", IsDraft = false, IsPublished = false, IsDiscontinued = true },
    ];

    private static PublishStatus Clone(PublishStatus s) => new()
    {
        Pkid = s.Pkid, Description = s.Description,
        IsDraft = s.IsDraft, IsPublished = s.IsPublished, IsDiscontinued = s.IsDiscontinued,
    };

    public Task<IEnumerable<PublishStatus>> GetAllAsync() =>
        Task.FromResult(_statuses.OrderBy(s => s.Pkid).Select(Clone).ToList().AsEnumerable());

    public Task<IEnumerable<PublishStatus>> QueryAsync(PublishStatusQuery q)
    {
        var result = _statuses.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(q.Keyword))
        {
            var k = q.Keyword.Trim();
            result = result.Where(s => s.Description.Contains(k, StringComparison.OrdinalIgnoreCase));
        }
        if (q.IsDraft.HasValue) result = result.Where(s => s.IsDraft == q.IsDraft);
        if (q.IsPublished.HasValue) result = result.Where(s => s.IsPublished == q.IsPublished);
        if (q.IsDiscontinued.HasValue) result = result.Where(s => s.IsDiscontinued == q.IsDiscontinued);
        return Task.FromResult(result.OrderBy(s => s.Pkid).Select(Clone).ToList().AsEnumerable());
    }

    public Task<PublishStatus?> GetByIdAsync(byte pkid) =>
        Task.FromResult(_statuses.Where(s => s.Pkid == pkid).Select(Clone).FirstOrDefault());

    public Task<bool> ExistsAsync(byte pkid) => Task.FromResult(_statuses.Any(s => s.Pkid == pkid));

    public Task<PublishStatus> CreateAsync(PublishStatusRequest request)
    {
        var status = new PublishStatus
        {
            Pkid = request.Pkid, Description = request.Description,
            IsDraft = request.IsDraft, IsPublished = request.IsPublished, IsDiscontinued = request.IsDiscontinued,
        };
        _statuses.Add(status);
        return Task.FromResult(Clone(status));
    }

    public Task<PublishStatus?> UpdateAsync(PublishStatusRequest request)
    {
        var status = _statuses.FirstOrDefault(s => s.Pkid == request.Pkid);
        if (status is null) return Task.FromResult<PublishStatus?>(null);
        status.Description = request.Description;
        status.IsDraft = request.IsDraft;
        status.IsPublished = request.IsPublished;
        status.IsDiscontinued = request.IsDiscontinued;
        return Task.FromResult<PublishStatus?>(Clone(status));
    }

    public Task<bool> DeleteAsync(byte pkid) => Task.FromResult(_statuses.RemoveAll(s => s.Pkid == pkid) > 0);

    public Task<IEnumerable<PublishStatusLookup>> GetLookupsAsync() =>
        Task.FromResult(_statuses.OrderBy(s => s.Pkid)
            .Select(s => new PublishStatusLookup { Pkid = s.Pkid, Description = s.Description })
            .ToList().AsEnumerable());
}
