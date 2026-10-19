using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace CMS.API.Controllers;

[ApiController]
[Route("api/lookups")]
public class LookupsController(IAppRoleRepository appRoles) : ControllerBase
{
    [HttpGet("appusers")]
    public async Task<ActionResult<IEnumerable<AppUserLookup>>> GetAppUsers() =>
        Ok(await appRoles.GetUserLookupsAsync());
}
