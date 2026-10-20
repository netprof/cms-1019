using System.ComponentModel.DataAnnotations;

namespace CMS.API.Models;

public class ModelPriceRequest
{
    /// <summary>Composite key part 1, user-supplied. Locked after creation.</summary>
    [Required, StringLength(100)]
    public string Model { get; set; } = "";

    /// <summary>Composite key part 2, user-supplied. Locked after creation.</summary>
    public DateOnly EffectiveDate { get; set; }

    // Decimal range: [Range(int, int)] would truncate -0.01 to 0 and accept it.
    [Range(typeof(decimal), "0", "999999")] public decimal InputPrice { get; set; }
    [Range(typeof(decimal), "0", "999999")] public decimal CacheWrite5mPrice { get; set; }
    [Range(typeof(decimal), "0", "999999")] public decimal CacheWrite1hPrice { get; set; }
    [Range(typeof(decimal), "0", "999999")] public decimal CacheReadPrice { get; set; }
    [Range(typeof(decimal), "0", "999999")] public decimal OutputPrice { get; set; }
}
