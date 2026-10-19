using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/lookups")]
public class LookupsController(
    IAppRoleRepository appRoles,
    IPublishStatusRepository publishStatuses,
    IPartnerRepository partners) : ControllerBase
{
    [HttpGet("appusers")]
    public async Task<ActionResult<IEnumerable<AppUserLookup>>> GetAppUsers() =>
        Ok(await appRoles.GetUserLookupsAsync());

    [HttpGet("publishstatuses")]
    public async Task<ActionResult<IEnumerable<PublishStatusLookup>>> GetPublishStatuses() =>
        Ok(await publishStatuses.GetLookupsAsync());

    [HttpGet("partners")]
    public async Task<ActionResult<IEnumerable<PartnerLookup>>> GetPartners() =>
        Ok(await partners.GetLookupsAsync());
}
