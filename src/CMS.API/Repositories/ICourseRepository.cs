using CMS.API.Models;

namespace CMS.API.Repositories;

public interface ICourseRepository
{
    Task<IEnumerable<Course>> GetAllAsync();
    Task<IEnumerable<Course>> QueryAsync(CourseQuery query);
    Task<Course?> GetByIdAsync(int pkid);
    Task<Course> CreateAsync(CourseRequest request);

    /// <returns>The updated record, or null if the course does not exist.</returns>
    Task<Course?> UpdateAsync(CourseRequest request);

    /// <returns>False if the course does not exist.</returns>
    Task<bool> DeleteAsync(int pkid);

    Task<IEnumerable<CertificationLookup>> GetCertificationLookupsAsync();
    Task<IEnumerable<JobCategoryLookup>> GetJobCategoryLookupsAsync();
}
