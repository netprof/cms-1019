using System.Data.Common;
using CMS.API.Data;
using CMS.API.Models;
using Dapper;

namespace CMS.API.Repositories;

public class CourseRepository(IDbConnectionFactory connectionFactory) : ICourseRepository
{
    private const string SelectSql = """
        SELECT c.pkid AS Pkid,
               c.Title,
               c.OfficialTitle,
               c.CourseId,
               c.ProdCourseId,
               c.FriendlyUrl,
               c.DisplayOrder,
               c.Partner_pkid AS PartnerPkid,
               c.CourseGroup_pkid AS CourseGroupPkid,
               c.PublishStatus_pkid AS PublishStatusPkid,
               c.ScheduleOn,
               c.ScheduleOff,
               c.Hour,
               c.ListPrice,
               c.LearningCredit,
               c.Material,
               c.Objective,
               c.Target,
               c.Prerequisites,
               c.Outline,
               c.TowardCertOrExam,
               c.Note,
               c.OtherInfo,
               c.CanRepeat,
               (SELECT COUNT(*) FROM CourseInCertification x WHERE x.Course_pkid = c.pkid) AS CertificationCount,
               (SELECT COUNT(*) FROM CourseJobCategories x WHERE x.Course_pkid = c.pkid) AS JobCategoryCount,
               p.pkid AS Pkid,
               p.Name,
               g.pkid AS Pkid,
               g.Description,
               s.pkid AS Pkid,
               s.Description
        FROM Course c
        JOIN Partner p ON p.pkid = c.Partner_pkid
        LEFT JOIN CourseGroup g ON g.pkid = c.CourseGroup_pkid
        JOIN PublishStatus s ON s.pkid = c.PublishStatus_pkid
        """;

    private const string OrderBy = " ORDER BY c.DisplayOrder, c.pkid";

    private const string SplitOn = "Pkid,Pkid,Pkid";

    private static Course Map(Course course, PartnerLookup partner, CourseGroupLookup? group, PublishStatusLookup status)
    {
        course.Partner = partner;
        course.CourseGroup = group;
        course.PublishStatus = status;
        return course;
    }

    private static Task<IEnumerable<Course>> QueryCoursesAsync(DbConnection conn, string sql, object? param = null) =>
        conn.QueryAsync<Course, PartnerLookup, CourseGroupLookup?, PublishStatusLookup, Course>(
            sql, Map, param, splitOn: SplitOn);

    public async Task<IEnumerable<Course>> GetAllAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await QueryCoursesAsync(conn, SelectSql + OrderBy);
    }

    public async Task<IEnumerable<Course>> QueryAsync(CourseQuery query)
    {
        var where = new List<string>();
        var p = new DynamicParameters();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            where.Add("""
                (c.Title LIKE @Keyword
                 OR c.OfficialTitle LIKE @Keyword
                 OR c.CourseId LIKE @Keyword
                 OR c.ProdCourseId LIKE @Keyword
                 OR c.FriendlyUrl LIKE @Keyword)
                """);
            p.Add("Keyword", $"%{query.Keyword.Trim()}%");
        }
        if (query.PartnerPkid.HasValue)
        {
            where.Add("c.Partner_pkid = @PartnerPkid");
            p.Add("PartnerPkid", query.PartnerPkid.Value);
        }
        if (query.CourseGroupPkid.HasValue)
        {
            where.Add("c.CourseGroup_pkid = @CourseGroupPkid");
            p.Add("CourseGroupPkid", query.CourseGroupPkid.Value);
        }
        if (query.PublishStatusPkid.HasValue)
        {
            where.Add("c.PublishStatus_pkid = @PublishStatusPkid");
            p.Add("PublishStatusPkid", query.PublishStatusPkid.Value);
        }
        if (query.CanRepeat.HasValue)
        {
            where.Add("c.CanRepeat = @CanRepeat");
            p.Add("CanRepeat", query.CanRepeat.Value);
        }
        if (query.ScheduleOnFrom.HasValue)
        {
            where.Add("c.ScheduleOn >= @ScheduleOnFrom");
            p.Add("ScheduleOnFrom", query.ScheduleOnFrom.Value);
        }
        if (query.ScheduleOnTo.HasValue)
        {
            where.Add("c.ScheduleOn <= @ScheduleOnTo");
            p.Add("ScheduleOnTo", query.ScheduleOnTo.Value);
        }
        if (query.ScheduleOffFrom.HasValue)
        {
            where.Add("c.ScheduleOff >= @ScheduleOffFrom");
            p.Add("ScheduleOffFrom", query.ScheduleOffFrom.Value);
        }
        if (query.ScheduleOffTo.HasValue)
        {
            where.Add("c.ScheduleOff <= @ScheduleOffTo");
            p.Add("ScheduleOffTo", query.ScheduleOffTo.Value);
        }

        var sql = SelectSql
            + (where.Count > 0 ? " WHERE " + string.Join(" AND ", where) : "")
            + OrderBy;

        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await QueryCoursesAsync(conn, sql, p);
    }

    public async Task<Course?> GetByIdAsync(int pkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await GetByIdAsync(conn, pkid);
    }

    private static async Task<Course?> GetByIdAsync(DbConnection conn, int pkid)
    {
        var course = (await QueryCoursesAsync(conn, $"{SelectSql} WHERE c.pkid = @pkid", new { pkid }))
            .SingleOrDefault();
        if (course is null) return null;

        course.CertificationPkids = (await conn.QueryAsync<int>(
            "SELECT Certification_pkid FROM CourseInCertification WHERE Course_pkid = @pkid ORDER BY Certification_pkid",
            new { pkid })).ToList();
        course.JobCategoryPkids = (await conn.QueryAsync<short>(
            "SELECT JobCategory_pkid FROM CourseJobCategories WHERE Course_pkid = @pkid ORDER BY JobCategory_pkid",
            new { pkid })).ToList();
        return course;
    }

    public async Task<Course> CreateAsync(CourseRequest request)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        using var tx = conn.BeginTransaction();

        var pkid = await conn.ExecuteScalarAsync<int>(
            """
            INSERT INTO Course (Title, OfficialTitle, CourseId, ProdCourseId, FriendlyUrl, DisplayOrder,
                                Partner_pkid, CourseGroup_pkid, PublishStatus_pkid, ScheduleOn, ScheduleOff,
                                Hour, ListPrice, LearningCredit, Material, Objective, Target, Prerequisites,
                                Outline, TowardCertOrExam, Note, OtherInfo, CanRepeat)
            VALUES (@Title, @OfficialTitle, @CourseId, @ProdCourseId, @FriendlyUrl, @DisplayOrder,
                    @PartnerPkid, @CourseGroupPkid, @PublishStatusPkid, @ScheduleOn, @ScheduleOff,
                    @Hour, @ListPrice, @LearningCredit, @Material, @Objective, @Target, @Prerequisites,
                    @Outline, @TowardCertOrExam, @Note, @OtherInfo, @CanRepeat);
            SELECT CAST(SCOPE_IDENTITY() AS int);
            """, request, tx);

        await ReplaceLinksAsync(conn, tx, pkid, request);
        await tx.CommitAsync();

        return (await GetByIdAsync(conn, pkid))!;
    }

    public async Task<Course?> UpdateAsync(CourseRequest request)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        using var tx = conn.BeginTransaction();

        var rows = await conn.ExecuteAsync(
            """
            UPDATE Course
            SET Title = @Title,
                OfficialTitle = @OfficialTitle,
                CourseId = @CourseId,
                ProdCourseId = @ProdCourseId,
                FriendlyUrl = @FriendlyUrl,
                DisplayOrder = @DisplayOrder,
                Partner_pkid = @PartnerPkid,
                CourseGroup_pkid = @CourseGroupPkid,
                PublishStatus_pkid = @PublishStatusPkid,
                ScheduleOn = @ScheduleOn,
                ScheduleOff = @ScheduleOff,
                Hour = @Hour,
                ListPrice = @ListPrice,
                LearningCredit = @LearningCredit,
                Material = @Material,
                Objective = @Objective,
                Target = @Target,
                Prerequisites = @Prerequisites,
                Outline = @Outline,
                TowardCertOrExam = @TowardCertOrExam,
                Note = @Note,
                OtherInfo = @OtherInfo,
                CanRepeat = @CanRepeat
            WHERE pkid = @Pkid
            """, request, tx);
        if (rows == 0) return null;

        await ReplaceLinksAsync(conn, tx, request.Pkid, request);
        await tx.CommitAsync();

        return await GetByIdAsync(conn, request.Pkid);
    }

    public async Task<bool> DeleteAsync(int pkid)
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        using var tx = conn.BeginTransaction();

        await conn.ExecuteAsync("DELETE FROM CourseInCertification WHERE Course_pkid = @pkid", new { pkid }, tx);
        await conn.ExecuteAsync("DELETE FROM CourseJobCategories WHERE Course_pkid = @pkid", new { pkid }, tx);
        // Throws SqlException 547 if CourseFAQ / CourseRelatedLink / HotCourse still reference the course.
        var rows = await conn.ExecuteAsync("DELETE FROM Course WHERE pkid = @pkid", new { pkid }, tx);
        await tx.CommitAsync();
        return rows > 0;
    }

    public async Task<IEnumerable<CertificationLookup>> GetCertificationLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<CertificationLookup>(
            "SELECT c.pkid AS Pkid, RTRIM(c.Title) AS Title, c.Partner_pkid AS PartnerPkid FROM Certification c ORDER BY c.Title");
    }

    public async Task<IEnumerable<JobCategoryLookup>> GetJobCategoryLookupsAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        return await conn.QueryAsync<JobCategoryLookup>(
            "SELECT pkid AS Pkid, Description FROM JobCategory ORDER BY pkid");
    }

    // n-n: delete-then-reinsert for both junction tables
    private static async Task ReplaceLinksAsync(DbConnection conn, DbTransaction tx, int pkid, CourseRequest request)
    {
        await conn.ExecuteAsync("DELETE FROM CourseInCertification WHERE Course_pkid = @pkid", new { pkid }, tx);
        await conn.ExecuteAsync(
            "INSERT INTO CourseInCertification (Course_pkid, Certification_pkid) VALUES (@Pkid, @CertificationPkid)",
            request.CertificationPkids.Distinct().Select(id => new { Pkid = pkid, CertificationPkid = id }), tx);

        await conn.ExecuteAsync("DELETE FROM CourseJobCategories WHERE Course_pkid = @pkid", new { pkid }, tx);
        await conn.ExecuteAsync(
            "INSERT INTO CourseJobCategories (Course_pkid, JobCategory_pkid) VALUES (@Pkid, @JobCategoryPkid)",
            request.JobCategoryPkids.Distinct().Select(id => new { Pkid = pkid, JobCategoryPkid = id }), tx);
    }
}
