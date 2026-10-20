using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/lookups")]
public class LookupsController(
    IAppRoleRepository appRoles,
    IAppUserRepository appUsers,
    IPublishStatusRepository publishStatuses,
    IPartnerRepository partners,
    ICourseGroupRepository courseGroups,
    ICourseRepository courses,
    IFeaturedPromoItemRepository featuredPromoItems) : ControllerBase
{
    /// <summary>Upper bound on promotion search results (Promotion2 has 1000+ rows).</summary>
    private const int PromotionSearchLimit = 20;

    [HttpGet("appusers")]
    public async Task<ActionResult<IEnumerable<AppUserLookup>>> GetAppUsers() =>
        Ok(await appRoles.GetUserLookupsAsync());

    [HttpGet("approles")]
    public async Task<ActionResult<IEnumerable<AppRoleLookup>>> GetAppRoles() =>
        Ok(await appUsers.GetRoleLookupsAsync());

    [HttpGet("publishstatuses")]
    public async Task<ActionResult<IEnumerable<PublishStatusLookup>>> GetPublishStatuses() =>
        Ok(await publishStatuses.GetLookupsAsync());

    [HttpGet("partners")]
    public async Task<ActionResult<IEnumerable<PartnerLookup>>> GetPartners() =>
        Ok(await partners.GetLookupsAsync());

    [HttpGet("coursegroups")]
    public async Task<ActionResult<IEnumerable<CourseGroupLookup>>> GetCourseGroups() =>
        Ok(await courseGroups.GetLookupsAsync());

    [HttpGet("certifications")]
    public async Task<ActionResult<IEnumerable<CertificationLookup>>> GetCertifications() =>
        Ok(await courses.GetCertificationLookupsAsync());

    [HttpGet("jobcategories")]
    public async Task<ActionResult<IEnumerable<JobCategoryLookup>>> GetJobCategories() =>
        Ok(await courses.GetJobCategoryLookupsAsync());

    [HttpGet("trainingcenters")]
    public async Task<ActionResult<IEnumerable<TrainingCenterLookup>>> GetTrainingCenters() =>
        Ok(await featuredPromoItems.GetTrainingCenterLookupsAsync());

    /// <summary>PromoCode search (contains, newest first) for the FeaturedPromoItem form's autocomplete.</summary>
    [HttpGet("promotions")]
    public async Task<ActionResult<IEnumerable<PromotionLookup>>> GetPromotions([FromQuery] string? keyword) =>
        Ok(await featuredPromoItems.SearchPromotionLookupsAsync(keyword, PromotionSearchLimit));
}
