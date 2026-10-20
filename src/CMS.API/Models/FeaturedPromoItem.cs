namespace CMS.API.Models;

public class FeaturedPromoItem
{
    public int Pkid { get; set; }
    public DateOnly ScheduleOn { get; set; }
    public short TrainingCenterPkid { get; set; }

    /// <summary>Position within the day (1–3); unique per ScheduleOn + TrainingCenter.</summary>
    public byte Slot { get; set; }

    public int PromotionPkid { get; set; }
    public string Topic { get; set; } = "";
    public string Description { get; set; } = "";

    /// <summary>Navigation object loaded by multi-map (PromoCode for display).</summary>
    public PromotionLookup Promotion { get; set; } = new();
}
