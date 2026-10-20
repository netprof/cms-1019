using CMS.API.Repositories;

namespace CMS.API.Tests;

/// <summary>SysConfig stand-in; pass null to simulate a missing <c>tokenUsageConfig</c> row or <c>apiKey</c>.</summary>
public class FakeIngestApiKeyReader(string? apiKey = FakeIngestApiKeyReader.ApiKey) : IIngestApiKeyReader
{
    public const string ApiKey = "test-ingest-key";

    public Task<string?> GetAsync() => Task.FromResult(apiKey);
}
