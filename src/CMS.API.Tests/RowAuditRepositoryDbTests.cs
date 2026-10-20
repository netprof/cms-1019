using System.Security.Claims;
using System.Transactions;
using CMS.API.Data;
using CMS.API.Models;
using CMS.API.Repositories;
using CMS.API.Services;
using Dapper;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace CMS.API.Tests;

/// <summary>
/// The one exception to "backend tests run on in-memory fakes": the audit row must be written in the
/// same transaction as the change, which only the real database can show. Uses the API's
/// <c>ConnectionStrings:Default</c>; each test rolls back everything it writes. Skipped when the
/// database cannot be reached.
/// </summary>
public class RowAuditRepositoryDbTests
{
    // A clock value no real change carries, so the tests can find exactly their own audit rows.
    private static readonly DateTimeOffset TestNow = new(2000, 1, 1, 0, 0, 0, TimeSpan.Zero);
    private const string TestUser = "rowaudit-test";

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private static readonly IDbConnectionFactory Db = new SqlConnectionFactory(
        new ConfigurationBuilder().SetBasePath(AppContext.BaseDirectory).AddJsonFile("appsettings.json").Build());

    private readonly CourseGroupRepository _courseGroups;
    private readonly PartnerRepository _partners;
    private readonly ModelPriceRepository _modelPrices;
    private readonly RowAuditWriter _audit;

    public RowAuditRepositoryDbTests()
    {
        // HttpContextAccessor keeps the context in an AsyncLocal, so set it on the test's own flow.
        var accessor = new HttpContextAccessor
        {
            HttpContext = new DefaultHttpContext
            {
                User = new ClaimsPrincipal(new ClaimsIdentity([new Claim("name", TestUser)], "Bearer", "name", "role")),
            },
        };
        var audit = new RowAuditWriter(accessor, new FixedTimeProvider(TestNow));
        _audit = audit;
        _courseGroups = new CourseGroupRepository(Db, audit);
        _partners = new PartnerRepository(Db, audit);
        _modelPrices = new ModelPriceRepository(Db, audit);
    }

    /// <summary>This test run's audit rows for <paramref name="tableName"/>, oldest first.</summary>
    private static async Task<List<RowAuditEntry>> AuditRowsAsync(string tableName)
    {
        using var conn = await Db.CreateOpenConnectionAsync();
        return (await conn.QueryAsync<RowAuditEntry>(
            """
            SELECT TableName, UserName, PrimaryKeyValues, ActionType, ActionDesc, [DateTime]
            FROM RowAudit
            WHERE TableName = @tableName AND [DateTime] = @time
            ORDER BY pkid
            """, new { tableName, time = TestNow.UtcDateTime })).ToList();
    }

    [SqlServerFact]
    public async Task Insert_WritesInsertRowWithFirstStringColumn()
    {
        using var rollback = DbTransactionScope.Begin(); // never completed

        var created = await _courseGroups.CreateAsync(new CourseGroupRequest { Description = "稽核測試群組" });

        var row = Assert.Single(await AuditRowsAsync("CourseGroup"));
        Assert.Equal("Insert", row.ActionType);
        Assert.Equal(created.Pkid.ToString(), row.PrimaryKeyValues);
        Assert.Equal("稽核測試群組", row.ActionDesc);
        Assert.Equal(TestUser, row.UserName);
    }

    [SqlServerFact]
    public async Task Update_WritesUpdateRowListingExactlyTheChangedColumns()
    {
        using var rollback = DbTransactionScope.Begin();
        var request = new PartnerRequest
        {
            Name = "稽核測試夥伴", AppKey = "rat", NameOnPartnerMenu = "選單名",
            NameOnCourseDetailPage = "頁面名", DisplayOrder = 1, ImageFilename = "a.png",
        };
        request.Pkid = (await _partners.CreateAsync(request)).Pkid;

        request.Name = "稽核測試夥伴 改";
        request.DisplayOrder = 2;
        await _partners.UpdateAsync(request);

        var rows = await AuditRowsAsync("Partner");
        Assert.Equal(["Insert", "Update"], rows.Select(r => r.ActionType));
        Assert.Equal(request.Pkid.ToString(), rows[1].PrimaryKeyValues);
        Assert.Equal("Name,DisplayOrder", rows[1].ActionDesc);
    }

    [SqlServerFact]
    public async Task Update_WithNoChange_WritesNoRow()
    {
        using var rollback = DbTransactionScope.Begin();
        var created = await _courseGroups.CreateAsync(new CourseGroupRequest { Description = "不變" });

        await _courseGroups.UpdateAsync(new CourseGroupRequest { Pkid = created.Pkid, Description = "不變" });

        Assert.Equal(["Insert"], (await AuditRowsAsync("CourseGroup")).Select(r => r.ActionType));
    }

    [SqlServerFact]
    public async Task Delete_WritesDeleteRowWithTheDeletedRowsFirstStringColumn()
    {
        using var rollback = DbTransactionScope.Begin();
        var created = await _courseGroups.CreateAsync(new CourseGroupRequest { Description = "將被刪除" });

        Assert.True(await _courseGroups.DeleteAsync(created.Pkid));

        var rows = await AuditRowsAsync("CourseGroup");
        Assert.Equal(["Insert", "Delete"], rows.Select(r => r.ActionType));
        Assert.Equal(created.Pkid.ToString(), rows[1].PrimaryKeyValues);
        Assert.Equal("將被刪除", rows[1].ActionDesc);
    }

    [SqlServerFact]
    public async Task History_ReadsOneRecordNewestFirst()
    {
        using var rollback = DbTransactionScope.Begin();
        var created = await _courseGroups.CreateAsync(new CourseGroupRequest { Description = "歷程" });
        await _courseGroups.CreateAsync(new CourseGroupRequest { Description = "別筆" });
        await _courseGroups.UpdateAsync(new CourseGroupRequest { Pkid = created.Pkid, Description = "歷程 改" });

        // Same fixed time for every row, so the order comes from the pkid tie-breaker.
        var history = (await new RowAuditRepository(Db).GetByRecordAsync("CourseGroup", created.Pkid.ToString())).ToList();

        Assert.Equal(["Update", "Insert"], history.Select(h => h.ActionType));
        Assert.Equal(["Description", "歷程"], history.Select(h => h.ActionDesc));
        Assert.All(history, h => Assert.Equal(TestUser, h.UserName));
        Assert.Empty(await new RowAuditRepository(Db).GetByRecordAsync("Partner", created.Pkid.ToString() + "x"));
    }

    [SqlServerFact]
    public async Task HistoryOfSeveralRecords_IsCombinedNewestFirstWithKeys()
    {
        using var rollback = DbTransactionScope.Begin();
        var a = await _courseGroups.CreateAsync(new CourseGroupRequest { Description = "甲" });
        var b = await _courseGroups.CreateAsync(new CourseGroupRequest { Description = "乙" });
        var other = await _courseGroups.CreateAsync(new CourseGroupRequest { Description = "丙" });
        await _courseGroups.UpdateAsync(new CourseGroupRequest { Pkid = a.Pkid, Description = "甲 改" });

        var history = (await new RowAuditRepository(Db).GetByRecordsAsync(
            "CourseGroup", [a.Pkid.ToString(), b.Pkid.ToString()])).ToList();

        Assert.Equal(
            [(a.Pkid.ToString(), "Update"), (b.Pkid.ToString(), "Insert"), (a.Pkid.ToString(), "Insert")],
            history.Select(h => (h.PrimaryKeyValues, h.ActionType)));
        Assert.DoesNotContain(history, h => h.PrimaryKeyValues == other.Pkid.ToString());
    }

    [SqlServerFact]
    public async Task FeaturedPromoItemMove_WritesASlotUpdateForBothSwappedItems()
    {
        using var rollback = DbTransactionScope.Begin();
        short center;
        int promotion;
        using (var conn = await Db.CreateOpenConnectionAsync())
        {
            center = await conn.ExecuteScalarAsync<short>("SELECT TOP 1 pkid FROM TrainingCenter");
            promotion = await conn.ExecuteScalarAsync<int>("SELECT TOP 1 pkid FROM Promotion2");
        }
        var items = new FeaturedPromoItemRepository(Db, _audit);
        var day = new DateOnly(2099, 1, 1);
        var first = await items.CreateAsync(new FeaturedPromoItemRequest
        {
            ScheduleOn = day, TrainingCenterPkid = center, Slot = 1, PromotionPkid = promotion, Topic = "一", Description = "d",
        });
        var second = await items.CreateAsync(new FeaturedPromoItemRequest
        {
            ScheduleOn = day, TrainingCenterPkid = center, Slot = 2, PromotionPkid = promotion, Topic = "二", Description = "d",
        });

        await items.MoveAsync(first, 2);

        var updates = (await AuditRowsAsync("FeaturedPromoItem")).Where(r => r.ActionType == "Update").ToList();
        Assert.Equal(
            [first.Pkid.ToString(), second.Pkid.ToString()],
            updates.Select(r => r.PrimaryKeyValues).Order());
        Assert.All(updates, r => Assert.Equal("Slot", r.ActionDesc));
    }

    [SqlServerFact]
    public async Task CompositeKey_IsWrittenAsModelCommaDate()
    {
        using var rollback = DbTransactionScope.Begin();

        await _modelPrices.CreateAsync(new ModelPriceRequest { Model = "rowaudit-test", EffectiveDate = new DateOnly(2000, 1, 2) });

        var row = Assert.Single(await AuditRowsAsync("ModelPrice"));
        Assert.Equal("rowaudit-test,2000-01-02", row.PrimaryKeyValues);
        Assert.Equal("rowaudit-test", row.ActionDesc);
    }

    [SqlServerFact]
    public async Task UpdateOrDelete_OfMissingRow_WritesNoRow()
    {
        using var rollback = DbTransactionScope.Begin();

        Assert.Null(await _courseGroups.UpdateAsync(new CourseGroupRequest { Pkid = -1, Description = "x" }));
        Assert.False(await _courseGroups.DeleteAsync(-1));

        Assert.Empty(await AuditRowsAsync("CourseGroup"));
    }

    // The failure tests run without an outer scope: the repository's own scope must roll back.

    [SqlServerFact]
    public async Task FailedInsert_LeavesNoAuditRow()
    {
        // Description is nvarchar(100).
        await Assert.ThrowsAsync<SqlException>(() =>
            _courseGroups.CreateAsync(new CourseGroupRequest { Description = new string('長', 101) }));

        Assert.Empty(await AuditRowsAsync("CourseGroup"));
    }

    [SqlServerFact]
    public async Task FailedDelete_LeavesNoAuditRowAndTheRowInPlace()
    {
        short? pkid;
        using (var conn = await Db.CreateOpenConnectionAsync())
        {
            pkid = await conn.ExecuteScalarAsync<short?>(
                "SELECT TOP 1 CourseGroup_pkid FROM Course WHERE CourseGroup_pkid IS NOT NULL");
        }
        Assert.True(pkid.HasValue, "Needs a CourseGroup referenced by a Course in the database.");

        // FK from Course: SQL error 547.
        var ex = await Assert.ThrowsAsync<SqlException>(() => _courseGroups.DeleteAsync(pkid.Value));
        Assert.Equal(547, ex.Number);

        Assert.Empty(await AuditRowsAsync("CourseGroup"));
        Assert.NotNull(await _courseGroups.GetByIdAsync(pkid.Value));
    }
}

/// <summary>A fact that is skipped when the API's database cannot be reached.</summary>
public sealed class SqlServerFactAttribute : FactAttribute
{
    private static readonly Lazy<bool> Available = new(() =>
    {
        try
        {
            var config = new ConfigurationBuilder().SetBasePath(AppContext.BaseDirectory).AddJsonFile("appsettings.json").Build();
            var builder = new SqlConnectionStringBuilder(config.GetConnectionString("Default")) { ConnectTimeout = 3 };
            using var scope = new TransactionScope(TransactionScopeOption.Suppress);
            using var conn = new SqlConnection(builder.ConnectionString);
            conn.Open();
            return true;
        }
        catch
        {
            return false;
        }
    });

    public SqlServerFactAttribute()
    {
        if (!Available.Value) Skip = "SQL Server (ConnectionStrings:Default) is not reachable.";
    }
}
