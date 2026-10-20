using System.Security.Claims;
using CMS.API.Models;
using CMS.API.Services;
using Microsoft.AspNetCore.Http;

namespace CMS.API.Tests;

/// <summary>
/// The writer's reflection logic, in memory. Writing the row through a repository, in its
/// transaction, is covered against the real database by <see cref="RowAuditRepositoryDbTests"/>.
/// </summary>
public class RowAuditWriterTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 20, 3, 4, 5, TimeSpan.Zero);

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class Sample
    {
        public int Pkid { get; set; }
        public short DisplayOrder { get; set; }
        public string Title { get; set; } = "";
        public string? Note { get; set; }
        public decimal Price { get; set; }
        public DateOnly? ScheduleOn { get; set; }
        public PartnerLookup Partner { get; set; } = new();
        public List<int> Tags { get; set; } = [];
    }

    private sealed class NoStrings
    {
        public long Pkid { get; set; }
        public int Count { get; set; }
    }

    private sealed class NoPkid
    {
        public string Code { get; set; } = "";
    }

    private static RowAuditWriter CreateWriter(ClaimsPrincipal? user = null)
    {
        var accessor = new HttpContextAccessor
        {
            HttpContext = user is null ? null : new DefaultHttpContext { User = user },
        };
        return new RowAuditWriter(accessor, new FixedTimeProvider(Now));
    }

    private static ClaimsPrincipal SignedIn(string userName) =>
        new(new ClaimsIdentity([new Claim("sub", "u01"), new Claim("name", userName)], "Bearer", "name", "role"));

    private static Sample NewSample() => new()
    {
        Pkid = 42, DisplayOrder = 1, Title = "Angular 入門", Note = "n", Price = 100m,
        ScheduleOn = new DateOnly(2026, 1, 1), Partner = new PartnerLookup(), Tags = [1, 2],
    };

    [Fact]
    public void Insert_UsesFirstStringPropertyAsDesc()
    {
        var row = CreateWriter(SignedIn("王小明")).BuildInsert("Course", NewSample());

        Assert.Equal("Course", row.TableName);
        Assert.Equal("王小明", row.UserName);
        Assert.Equal("42", row.PrimaryKeyValues);
        Assert.Equal("Insert", row.ActionType);
        Assert.Equal("Angular 入門", row.ActionDesc);
        Assert.Equal(Now.UtcDateTime, row.DateTime);
    }

    [Fact]
    public void Delete_UsesFirstStringPropertyAsDesc()
    {
        var row = CreateWriter(SignedIn("admin")).BuildDelete("Course", NewSample());

        Assert.Equal("Delete", row.ActionType);
        Assert.Equal("42", row.PrimaryKeyValues);
        Assert.Equal("Angular 入門", row.ActionDesc);
    }

    [Fact]
    public void FirstStringProperty_IsInDeclarationOrderNotJustAnyString()
    {
        // Title is declared before Note; Pkid/DisplayOrder before it are not strings.
        var entity = NewSample();
        entity.Title = "first";
        entity.Note = "second";

        Assert.Equal("first", CreateWriter().BuildInsert("Course", entity).ActionDesc);
    }

    [Fact]
    public void Insert_WithoutStringProperty_HasNullDesc()
    {
        Assert.Null(CreateWriter().BuildInsert("X", new NoStrings { Pkid = 7 }).ActionDesc);
    }

    [Fact]
    public void PrimaryKeyValues_ReadsPkidOfAnyIntegerType()
    {
        Assert.Equal("9000000000", CreateWriter().BuildDelete("X", new NoStrings { Pkid = 9_000_000_000 }).PrimaryKeyValues);
    }

    [Fact]
    public void PrimaryKeyValues_WithoutPkid_Throws()
    {
        Assert.Throws<InvalidOperationException>(() => CreateWriter().BuildInsert("X", new NoPkid()));
    }

    [Fact]
    public void PrimaryKeyValues_Explicit_OverridesPkidLookup()
    {
        Assert.Equal("m,2026-01-01", CreateWriter().BuildDelete("X", new NoPkid(), "m,2026-01-01").PrimaryKeyValues);
    }

    [Fact]
    public void Update_ListsExactlyTheChangedPropertyNames()
    {
        var before = NewSample();
        var after = NewSample();
        after.Title = "Angular 進階";
        after.Note = null;
        after.ScheduleOn = new DateOnly(2026, 2, 1);
        // Different instances of nav objects and lists are not reported as changes.
        after.Partner = new PartnerLookup();
        after.Tags = [3];

        var row = CreateWriter(SignedIn("admin")).BuildUpdate("Course", before, after);

        Assert.Equal("Update", row.ActionType);
        Assert.Equal("42", row.PrimaryKeyValues);
        Assert.Equal("Title,Note,ScheduleOn", row.ActionDesc);
    }

    [Fact]
    public void Update_NothingChanged_HasEmptyDesc()
    {
        Assert.Equal("", CreateWriter(SignedIn("admin")).BuildUpdate("Course", NewSample(), NewSample()).ActionDesc);
    }

    [Fact]
    public void UserName_Over100Chars_IsTruncatedToTheColumn()
    {
        var row = CreateWriter(SignedIn(new string('名', 150))).BuildInsert("Course", NewSample());

        Assert.Equal(new string('名', 100), row.UserName);
    }

    [Fact]
    public void UserName_WithoutHttpContext_IsSystem()
    {
        Assert.Equal("system", CreateWriter().BuildInsert("Course", NewSample()).UserName);
    }

    [Fact]
    public void UserName_WithAnonymousUser_IsSystem()
    {
        var writer = CreateWriter(new ClaimsPrincipal(new ClaimsIdentity()));

        Assert.Equal("system", writer.BuildInsert("Course", NewSample()).UserName);
    }

    [Fact]
    public void ActionDesc_AsciiOver1000Chars_IsTruncatedTo1000()
    {
        var entity = NewSample();
        entity.Title = new string('a', 1500);

        Assert.Equal(new string('a', 1000), CreateWriter().BuildInsert("Course", entity).ActionDesc);
    }

    [Fact]
    public void ActionDesc_Exactly1000Chars_IsKept()
    {
        var entity = NewSample();
        entity.Title = new string('a', 1000);

        Assert.Equal(1000, CreateWriter().BuildInsert("Course", entity).ActionDesc!.Length);
    }

    [Fact]
    public void ActionDesc_Chinese_IsTruncatedTo1000BytesOfTheVarcharColumn()
    {
        // varchar(1000) in Big5 holds 500 Chinese characters (2 bytes each).
        var entity = NewSample();
        entity.Title = "a" + new string('課', 600);

        var desc = CreateWriter().BuildInsert("Course", entity).ActionDesc!;

        Assert.Equal("a" + new string('課', 499), desc);
    }
}
