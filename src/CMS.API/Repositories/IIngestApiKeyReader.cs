namespace CMS.API.Repositories;

/// <summary>Reads the token usage ingest API key used by <c>[RequireIngestApiKey]</c>.</summary>
public interface IIngestApiKeyReader
{
    /// <summary>Reads <c>apiKey</c> from the SysConfig <c>tokenUsageConfig</c> JSON.</summary>
    /// <returns>The key, or null when the row, the property or a usable value is missing.</returns>
    Task<string?> GetAsync();
}
