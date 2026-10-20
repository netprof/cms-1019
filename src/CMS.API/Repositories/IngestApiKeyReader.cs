using System.Text.Json;
using CMS.API.Data;
using Dapper;

namespace CMS.API.Repositories;

public class IngestApiKeyReader(IDbConnectionFactory connectionFactory) : IIngestApiKeyReader
{
    public async Task<string?> GetAsync()
    {
        using var conn = await connectionFactory.CreateOpenConnectionAsync();
        var json = await conn.ExecuteScalarAsync<string?>(
            "SELECT configValue FROM SysConfig WHERE configKey = 'tokenUsageConfig'");
        if (string.IsNullOrWhiteSpace(json)) return null;

        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind == JsonValueKind.Object
                && doc.RootElement.TryGetProperty("apiKey", out var prop)
                && prop.ValueKind == JsonValueKind.String
                && !string.IsNullOrEmpty(prop.GetString())
                ? prop.GetString()
                : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
