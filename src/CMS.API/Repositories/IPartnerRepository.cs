using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IPartnerRepository
{
    Task<IEnumerable<Partner>> GetAllAsync();
    Task<IEnumerable<Partner>> QueryAsync(PartnerQuery query);
    Task<Partner?> GetByIdAsync(short pkid);
    Task<Partner> CreateAsync(PartnerRequest request);

    /// <returns>The updated record, or null if the partner does not exist.</returns>
    Task<Partner?> UpdateAsync(PartnerRequest request);

    /// <returns>False if the partner does not exist.</returns>
    Task<bool> DeleteAsync(short pkid);
    Task<IEnumerable<PartnerLookup>> GetLookupsAsync();
}
