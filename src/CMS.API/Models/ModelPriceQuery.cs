namespace CMS.API.Models;

public class ModelPriceQuery
{
    /// <summary>Matches Model (contains).</summary>
    public string? Keyword { get; set; }

    /// <summary>Inclusive EffectiveDate range; null = open end.</summary>
    public DateOnly? EffectiveDateFrom { get; set; }
    public DateOnly? EffectiveDateTo { get; set; }
}
