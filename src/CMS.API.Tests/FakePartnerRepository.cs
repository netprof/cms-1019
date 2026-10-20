using CMS.API.Models;
using CMS.API.Repositories;

namespace CMS.API.Tests;

public class FakePartnerRepository : IPartnerRepository
{
    // DisplayOrder deliberately differs from pkid order so ordering is observable.
    private readonly List<Partner> _partners =
    [
        new()
        {
            Pkid = 1, Name = "Microsoft", AppKey = "msft", NameOnPartnerMenu = "Microsoft 微軟",
            NameOnCourseDetailPage = "Microsoft", DisplayOrder = 2, ImageFilename = "microsoft.png",
        },
        new()
        {
            Pkid = 2, Name = "Cisco", AppKey = "csco", NameOnPartnerMenu = "Cisco 思科",
            NameOnCourseDetailPage = "Cisco", DisplayOrder = 1, ImageFilename = null,
        },
        new()
        {
            Pkid = 3, Name = "Oracle", AppKey = "orcl", NameOnPartnerMenu = "Oracle 甲骨文",
            NameOnCourseDetailPage = "Oracle", DisplayOrder = 3, ImageFilename = "oracle.png",
        },
    ];

    private static Partner Clone(Partner p) => new()
    {
        Pkid = p.Pkid, Name = p.Name, AppKey = p.AppKey,
        NameOnPartnerMenu = p.NameOnPartnerMenu, NameOnCourseDetailPage = p.NameOnCourseDetailPage,
        DisplayOrder = p.DisplayOrder, ImageFilename = p.ImageFilename,
    };

    private static IEnumerable<Partner> Ordered(IEnumerable<Partner> source) =>
        source.OrderBy(p => p.DisplayOrder).ThenBy(p => p.Pkid);

    public Task<IEnumerable<Partner>> GetAllAsync() =>
        Task.FromResult(Ordered(_partners).Select(Clone).ToList().AsEnumerable());

    public Task<IEnumerable<Partner>> QueryAsync(PartnerQuery q)
    {
        var result = _partners.AsEnumerable();
        if (!string.IsNullOrWhiteSpace(q.Keyword))
        {
            var k = q.Keyword.Trim();
            result = result.Where(p =>
                p.Name.Contains(k, StringComparison.OrdinalIgnoreCase)
                || p.AppKey.Contains(k, StringComparison.OrdinalIgnoreCase)
                || p.NameOnPartnerMenu.Contains(k, StringComparison.OrdinalIgnoreCase)
                || p.NameOnCourseDetailPage.Contains(k, StringComparison.OrdinalIgnoreCase));
        }
        return Task.FromResult(Ordered(result).Select(Clone).ToList().AsEnumerable());
    }

    public Task<Partner?> GetByIdAsync(short pkid) =>
        Task.FromResult(_partners.Where(p => p.Pkid == pkid).Select(Clone).FirstOrDefault());

    public Task<Partner> CreateAsync(PartnerRequest request)
    {
        var partner = new Partner
        {
            Pkid = (short)(_partners.Count == 0 ? 1 : _partners.Max(p => p.Pkid) + 1),
            Name = request.Name, AppKey = request.AppKey,
            NameOnPartnerMenu = request.NameOnPartnerMenu, NameOnCourseDetailPage = request.NameOnCourseDetailPage,
            DisplayOrder = request.DisplayOrder, ImageFilename = request.ImageFilename,
        };
        _partners.Add(partner);
        return Task.FromResult(Clone(partner));
    }

    public Task<Partner?> UpdateAsync(PartnerRequest request)
    {
        var partner = _partners.FirstOrDefault(p => p.Pkid == request.Pkid);
        if (partner is null) return Task.FromResult<Partner?>(null);
        partner.Name = request.Name;
        partner.AppKey = request.AppKey;
        partner.NameOnPartnerMenu = request.NameOnPartnerMenu;
        partner.NameOnCourseDetailPage = request.NameOnCourseDetailPage;
        partner.DisplayOrder = request.DisplayOrder;
        partner.ImageFilename = request.ImageFilename;
        return Task.FromResult<Partner?>(Clone(partner));
    }

    public Task<bool> DeleteAsync(short pkid) => Task.FromResult(_partners.RemoveAll(p => p.Pkid == pkid) > 0);

    public Task<IEnumerable<PartnerLookup>> GetLookupsAsync() =>
        Task.FromResult(Ordered(_partners)
            .Select(p => new PartnerLookup { Pkid = p.Pkid, Name = p.Name })
            .ToList().AsEnumerable());
}
