using CMS.API.Models;

namespace CMS.API.Repositories;

public interface IPublishStatusRepository
{
    Task<IEnumerable<PublishStatus>> GetAllAsync();
    Task<IEnumerable<PublishStatus>> QueryAsync(PublishStatusQuery query);
    Task<PublishStatus?> GetByIdAsync(byte pkid);
    Task<bool> ExistsAsync(byte pkid);
    Task<PublishStatus> CreateAsync(PublishStatusRequest request);

    /// <returns>The updated record, or null if the status does not exist.</returns>
    Task<PublishStatus?> UpdateAsync(PublishStatusRequest request);

    /// <returns>False if the status does not exist.</returns>
    Task<bool> DeleteAsync(byte pkid);
    Task<IEnumerable<PublishStatusLookup>> GetLookupsAsync();
}
