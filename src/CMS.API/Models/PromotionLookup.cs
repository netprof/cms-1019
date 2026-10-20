namespace CMS.API.Models;

public class PromotionLookup
{
    public int Pkid { get; set; }
    public string PromoCode { get; set; } = "";
    public string Topic { get; set; } = "";
    public string Description { get; set; } = "";
}
