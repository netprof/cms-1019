using CMS.API.Models;

namespace CMS.API.Repositories;

public interface ICourseGroupRepository
{
    Task<IEnumerable<CourseGroup>> GetAllAsync();
    Task<IEnumerable<CourseGroup>> QueryAsync(CourseGroupQuery query);
    Task<CourseGroup?> GetByIdAsync(short pkid);
    Task<CourseGroup> CreateAsync(CourseGroupRequest request);

    /// <returns>The updated record, or null if the course group does not exist.</returns>
    Task<CourseGroup?> UpdateAsync(CourseGroupRequest request);

    /// <summary>
    /// True if any Course or PartnerCourseGroup row references this course group.
    /// Checked before DELETE because FK_Course_CourseGroup is ON DELETE CASCADE.
    /// </summary>
    Task<bool> IsInUseAsync(short pkid);

    /// <returns>False if the course group does not exist.</returns>
    Task<bool> DeleteAsync(short pkid);
    Task<IEnumerable<CourseGroupLookup>> GetLookupsAsync();
}
