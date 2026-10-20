using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

public class FeaturedPromoItemRequest
{
    /// <summary>int IDENTITY key. Ignored on create; identifies the row on update.</summary>
    public int Pkid { get; set; }

    public DateOnly ScheduleOn { get; set; }

    [Range(1, short.MaxValue)]
    public short TrainingCenterPkid { get; set; }

    [Range(FeaturedPromoItemSlots.First, FeaturedPromoItemSlots.Last)]
    public byte Slot { get; set; }

    [Range(1, int.MaxValue)]
    public int PromotionPkid { get; set; }

    [Required, StringLength(100)]
    public string Topic { get; set; } = "";

    [Required, StringLength(300)]
    public string Description { get; set; } = "";
}

public static class FeaturedPromoItemSlots
{
    public const int First = 1;
    public const int Last = 3;
}
