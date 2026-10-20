namespace CMS.API.Models;

/// <summary>Claude model prices in USD per million tokens, from <see cref="EffectiveDate"/> onward.</summary>
public class ModelPrice
{
    /// <summary>Composite key part 1: API model ID, e.g. <c>claude-opus-5-5</c>.</summary>
    public string Model { get; set; } = "";

    /// <summary>Composite key part 2.</summary>
    public DateOnly EffectiveDate { get; set; }

    public decimal InputPrice { get; set; }
    public decimal CacheWrite5mPrice { get; set; }
    public decimal CacheWrite1hPrice { get; set; }
    public decimal CacheReadPrice { get; set; }
    public decimal OutputPrice { get; set; }
}
