using System.Net;
using System.Net.Http.Json;
using CMS.API.Models;
using CMS.API.Repositories;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CMS.API.Tests;

public class RowAuditApiTests : IClassFixture<ApiTestFactory>
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeRowAuditRepository _repository = new();

    public RowAuditApiTests(ApiTestFactory factory)
    {
        _factory = factory.WithWebHostBuilder(builder => builder.ConfigureServices(services =>
        {
            services.RemoveAll<IRowAuditRepository>();
            services.AddSingleton<IRowAuditRepository>(_repository);
        }));

        // Inserted out of time order, mixed with other records and tables.
        _repository.Rows.AddRange(
        [
            Row("Course", "123", "Update", "Title", new DateTime(2026, 6, 4, 14, 30, 0), "alice"),
            Row("Course", "123", "Insert", "Angular 入門", new DateTime(2026, 6, 1, 9, 0, 0), "bob"),
            Row("Course", "124", "Insert", "Other course", new DateTime(2026, 6, 5, 0, 0, 0), "bob"),
            Row("Partner", "123", "Insert", "Same pkid, other table", new DateTime(2026, 6, 6, 0, 0, 0), "bob"),
            Row("Course", "123", "Update", "Note,Hour", new DateTime(2026, 6, 2, 10, 0, 0), "carol"),
        ]);
    }

    private static RowAuditEntry Row(string table, string pk, string type, string desc, DateTime time, string user) => new()
    {
        TableName = table, PrimaryKeyValues = pk, ActionType = type, ActionDesc = desc, DateTime = time, UserName = user,
    };

    [Fact]
    public async Task Get_FiltersByTableAndPkid_NewestFirst()
    {
        var rows = await _factory.CreateAuthenticatedClient()
            .GetFromJsonAsync<List<RowAuditRecord>>("/api/rowaudit?tableName=Course&pkid=123");

        Assert.NotNull(rows);
        Assert.Equal(["Title", "Note,Hour", "Angular 入門"], rows.Select(r => r.ActionDesc));
        Assert.Equal(["alice", "carol", "bob"], rows.Select(r => r.UserName));
        Assert.Equal(["Update", "Update", "Insert"], rows.Select(r => r.ActionType));
        Assert.Equal(new DateTime(2026, 6, 4, 14, 30, 0), rows[0].DateTime);
    }

    [Fact]
    public async Task Get_ReturnsOnlyTheFourFields()
    {
        var json = await _factory.CreateAuthenticatedClient().GetStringAsync("/api/rowaudit?tableName=Course&pkid=124");

        Assert.Equal(
            """[{"dateTime":"2026-06-05T00:00:00","userName":"bob","actionType":"Insert","actionDesc":"Other course"}]""",
            json);
    }

    [Fact]
    public async Task Get_RecordWithoutHistory_ReturnsEmptyList()
    {
        var rows = await _factory.CreateAuthenticatedClient()
            .GetFromJsonAsync<List<RowAuditRecord>>("/api/rowaudit?tableName=Course&pkid=999");

        Assert.Empty(rows!);
    }

    [Fact]
    public async Task Get_CompositeKey_IsMatchedAsGiven()
    {
        _repository.Rows.Add(Row("ModelPrice", "claude-x,2026-01-01", "Insert", "claude-x", DateTime.UtcNow, "alice"));

        var rows = await _factory.CreateAuthenticatedClient()
            .GetFromJsonAsync<List<RowAuditRecord>>("/api/rowaudit?tableName=ModelPrice&pkid=claude-x%2C2026-01-01");

        Assert.Equal(["claude-x"], rows!.Select(r => r.ActionDesc));
    }

    [Theory]
    [InlineData("/api/rowaudit?tableName=Course")]
    [InlineData("/api/rowaudit?pkid=123")]
    [InlineData("/api/rowaudit?tableName=%20&pkid=123")]
    public async Task Get_WithoutTableNameOrPkid_Returns400(string url)
    {
        var response = await _factory.CreateAuthenticatedClient().GetAsync(url);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Query_CombinesTheGivenRecordsOfOneTable_NewestFirst_WithTheirKeys()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/rowaudit/query",
            new RowAuditQuery { TableName = "Course", Pkids = ["123", "124", "999"] });

        response.EnsureSuccessStatusCode();
        var rows = (await response.Content.ReadFromJsonAsync<List<RowAuditKeyedRecord>>())!;
        // Partner 123 is excluded: other table.
        Assert.Equal(["124", "123", "123", "123"], rows.Select(r => r.PrimaryKeyValues));
        Assert.Equal(["Other course", "Title", "Note,Hour", "Angular 入門"], rows.Select(r => r.ActionDesc));
    }

    [Fact]
    public async Task Query_WithNoPkids_ReturnsEmptyList()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/rowaudit/query",
            new RowAuditQuery { TableName = "Course", Pkids = [] });

        Assert.Empty((await response.Content.ReadFromJsonAsync<List<RowAuditKeyedRecord>>())!);
    }

    [Fact]
    public async Task Query_WithoutTableName_Returns400()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/rowaudit/query",
            new { pkids = new[] { "123" } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Query_WithTooManyPkids_Returns400()
    {
        var response = await _factory.CreateAuthenticatedClient().PostAsJsonAsync("/api/rowaudit/query",
            new RowAuditQuery
            {
                TableName = "Course",
                Pkids = Enumerable.Range(1, RowAuditQueryLimits.MaxPkids + 1).Select(i => i.ToString()).ToList(),
            });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Get_WithoutToken_Returns401()
    {
        var response = await _factory.CreateClient().GetAsync("/api/rowaudit?tableName=Course&pkid=123");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
