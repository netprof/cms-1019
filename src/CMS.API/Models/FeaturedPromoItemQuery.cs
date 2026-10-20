namespace CMS.API.Models;

public class FeaturedPromoItemQuery
{
    public short? TrainingCenterPkid { get; set; }

    /// <summary>
    /// Any day of the wanted week. The controller expands it to Monday–Sunday and
    /// overwrites <see cref="ScheduleOnFrom"/> / <see cref="ScheduleOnTo"/>.
    /// </summary>
    public DateOnly? WeekOf { get; set; }

    /// <summary>Inclusive.</summary>
    public DateOnly? ScheduleOnFrom { get; set; }

    /// <summary>Inclusive.</summary>
    public DateOnly? ScheduleOnTo { get; set; }
}
