# Build Spec for CourseGroup
- database schema: `.\database\course.sql`

---

## Summary

`CourseGroup` is a tiny reference table that names the groups courses are organised into (e.g. 基礎課程, 進階課程, 認證課程). Each row is just an identity key and a `Description`. It is the parent of `Course` (nullable FK) and `PartnerCourseGroup` (required FK). Together with `Partner`, it is one of the two lookups that `PartnerCourseGroup` and `Course` need, so it is a prerequisite for those features.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **smallint IDENTITY** → C# `short` |
| Foreign Keys | None |
| Required Fields | `Description` |
| N-N Relationships | N/A — `PartnerCourseGroup` is a child entity with its own identity (see N-N section) |
| Primary-Foreign Links | `Course.CourseGroup_pkid` (nullable, **ON DELETE CASCADE**), `PartnerCourseGroup.CourseGroup_pkid` (required, no cascade) — neither feature exists yet |
| Query Filters | keyword (Description) |
| Default Sort | `pkid ASC` (no `DisplayOrder` column; matches the `PublishStatus` precedent for code tables) |

---

## Localization

### Chinese Table Name

- CourseGroup: 課程群組
- Description: 課程分類群組代碼表，供課程與合作廠商課程群組引用

### Chinese Column Names

- pkid: 主代碼
- Description: 群組說明

---

## Required Fields

Required (NOT NULL):
- `Description` nvarchar(100) — trimmed on save

Optional (nullable):
- none

---

## Foreign Keys

**N/A** — `CourseGroup` has no foreign key columns.

---

## Foreign-Primary Links

**N/A**

---

## Primary-Foreign Links

The following tables reference `CourseGroup.pkid`:

| Child table | FK column | Nullable | On delete | Column header | Button | Would link to |
|-------------|-----------|----------|-----------|---------------|--------|---------------|
| `Course` (course.sql) | `CourseGroup_pkid` | yes | **CASCADE** | 對應課程 | 查看課程 `pi pi-book` | `/courses?courseGroupPkid={pkid}` |
| `PartnerCourseGroup` (course.sql) | `CourseGroup_pkid` | no | NO ACTION | 對應廠商課程群組 | 查看廠商課程群組 `pi pi-sitemap` | `/partner-course-groups?courseGroupPkid={pkid}` |

Neither feature exists in the app yet, so **no link buttons are rendered for now**. When each child feature is built, add its button to the CourseGroup list (操作 column) and detail toolbar using the route above, and have the child list accept the `courseGroupPkid` query param, overriding its saved filter state.

### Delete safety (important)

`FK_Course_CourseGroup` is declared `ON DELETE CASCADE`. A plain `DELETE FROM CourseGroup` would therefore **silently delete every Course in that group** (and, through further cascades on `CourseInCertification` / `CourseJobCategories`, their links too). That is almost certainly not what an admin clicking 刪除 on a lookup row expects.

The API therefore refuses to delete a CourseGroup that is still referenced:

1. `IsInUseAsync(pkid)` checks `EXISTS (Course WHERE CourseGroup_pkid = @pkid)` **or** `EXISTS (PartnerCourseGroup WHERE CourseGroup_pkid = @pkid)`.
2. If in use → **409 Conflict** before any DELETE is issued (so the cascade never fires).
3. The DELETE itself is still wrapped in the SQL error 547 → 409 mapping (same as `Partner`) to cover the `PartnerCourseGroup` FK and any race between the check and the delete.

The UI shows: 此課程群組已被課程或廠商課程群組使用，無法刪除。

---

## N-N Relationships

**N/A**

`PartnerCourseGroup` (`pkid` int IDENTITY, `Partner_pkid`, `CourseGroup_pkid`, `DisplayOrder`, `Description`) is **not** treated as a Partner ↔ CourseGroup junction, for the reasons already recorded in `spec/course/Partner.md`: it has its own identity that `Promotion2.RelatedPartnerCourseGroup_pkid` references, and it carries per-row data. It is a child entity with its own future CRUD. The CourseGroup form has no multiselect.

---

## Query Filters

- **keyword**: string
  - LIKE on `Description` (the only string column)

No FK columns → no dropdown filters. No bit columns → no bool filters. No date columns → no date-range filters.

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/coursegroups` | **New** | `{ pkid, description }[]` ordered by `pkid ASC` — for Course / PartnerCourseGroup dropdowns later |

Route name follows the existing no-hyphen convention (`/api/lookups/publishstatuses`, `/api/lookups/partners`).

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/coursegroups` | List all, `ORDER BY pkid` |
| `POST` | `/api/coursegroups/query` | Filtered query (body: `CourseGroupQuery`) |
| `GET` | `/api/coursegroups/{id:int}` | Get by pkid; 404 if missing |
| `POST` | `/api/coursegroups` | Create; 201 + Location; returns the row with the generated pkid |
| `PUT` | `/api/coursegroups` | Update (pkid from body); 404 if missing |
| `DELETE` | `/api/coursegroups/{id:int}` | Delete; 404 if missing; **409** if referenced by Course / PartnerCourseGroup (checked before delete, see above) |
| `GET` | `/api/lookups/coursegroups` | Slim lookup list |

Auth exceptions: none.

Controller trims `Description` before calling the repository.

---

## Backend Notes

### Models

```csharp
public class CourseGroup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = "";
}

public class CourseGroupRequest
{
    public short Pkid { get; set; }                      // ignored on POST (IDENTITY)

    [Required, StringLength(100)]
    public string Description { get; set; } = "";
}

public class CourseGroupQuery
{
    /// <summary>Matches Description (contains).</summary>
    public string? Keyword { get; set; }
}

public class CourseGroupLookup
{
    public short Pkid { get; set; }
    public string Description { get; set; } = "";
}
```

### Repository interface

```csharp
Task<IEnumerable<CourseGroup>> GetAllAsync();
Task<IEnumerable<CourseGroup>> QueryAsync(CourseGroupQuery query);
Task<CourseGroup?> GetByIdAsync(short pkid);
Task<CourseGroup> CreateAsync(CourseGroupRequest request);
Task<CourseGroup?> UpdateAsync(CourseGroupRequest request);   // null → 404
Task<bool> IsInUseAsync(short pkid);                          // Course or PartnerCourseGroup references
Task<bool> DeleteAsync(short pkid);                           // false → 404
Task<IEnumerable<CourseGroupLookup>> GetLookupsAsync();
```

### SQL — SELECT

```sql
SELECT g.pkid AS Pkid, g.Description
FROM CourseGroup g
-- GetAll:  ORDER BY g.pkid
-- Query:   WHERE g.Description LIKE @Keyword ORDER BY g.pkid
-- GetById: WHERE g.pkid = @pkid
```

No JOINs, no multi-map, no `nchar` columns (no `RTRIM()` needed).

### SQL — INSERT

```sql
INSERT INTO CourseGroup (Description) VALUES (@Description);
SELECT CAST(SCOPE_IDENTITY() AS smallint);
```

### SQL — UPDATE

```sql
UPDATE CourseGroup SET Description = @Description WHERE pkid = @Pkid;
-- 0 rows affected → 404
```

### SQL — IsInUse

```sql
SELECT CASE WHEN EXISTS (SELECT 1 FROM Course WHERE CourseGroup_pkid = @pkid)
              OR EXISTS (SELECT 1 FROM PartnerCourseGroup WHERE CourseGroup_pkid = @pkid)
       THEN 1 ELSE 0 END
```

### SQL — DELETE

```sql
DELETE FROM CourseGroup WHERE pkid = @pkid;
-- 0 rows → 404; SqlException 547 (FK violation) → 409
```

### SQL — Lookup

```sql
SELECT pkid AS Pkid, Description FROM CourseGroup ORDER BY pkid
```

### N-N Sync Pattern

N/A

### Special Column Notes

- `pkid` is `smallint IDENTITY` → C# `short`; `SCOPE_IDENTITY()` cast to `smallint`. Route uses `{id:int}`; out-of-range values fail model binding to the `short` parameter with a 400.
- No `nchar`, no computed columns, no date/time columns, no `varchar`.
- **ON DELETE CASCADE** from `Course` — see *Delete safety* above. This is the one non-standard behaviour in this feature.
- **RowAudit**: the project has no audit writer yet (`AppRole`, `PublishStatus`, `Partner` do not log). Not implemented here.

---

## Frontend Notes

### Routes

| Route | Component |
|-------|-----------|
| `/course-groups` | `CourseGroupList` |
| `/course-groups/new` | `CourseGroupForm` (add) — **must precede `:id`** |
| `/course-groups/:id/edit` | `CourseGroupForm` (edit) |
| `/course-groups/:id` | `CourseGroupDetail` |

### Angular model (`features/course-groups/course-group.model.ts`)

```ts
export interface CourseGroup {
  pkid: number;
  description: string;
}
export type CourseGroupRequest = CourseGroup;
export interface CourseGroupQuery {
  keyword?: string | null;
}
export interface CourseGroupLookup { pkid: number; description: string; }
```

Service (`course-group.service.ts`): `getAll`, `query`, `get(id: number)`, `create`, `update`, `delete(id: number)`, `getLookups`. Numeric PK → no `encodeURIComponent`.

### List page

- Title: 課程群組 CourseGroup
- Columns (all sortable): 主代碼 · 群組說明 · 操作 (檢視 / 編輯 / 刪除)
- Filter drawer (`p-drawer`, right): 關鍵字 (`input pInputText`) only.
- Default sort `pkid ASC`; page size 20.
- No lookups to load → no `forkJoin` on init; restore saved filters immediately.

### Delete Confirmation Message

```
確定要刪除主代碼 <b>${item.pkid}</b>「${item.description}」？
```

On 409 show: 此課程群組已被課程或廠商課程群組使用，無法刪除。

### Session Storage Keys

| Key | Contents |
|-----|----------|
| `coursegroup-list-filters` | Last query filter values |
| `coursegroup-list-sort` | `{ field, order }` |
| `coursegroup-list-page` | `{ first, rows }` |

No incoming cross-entity query params (nothing links *into* CourseGroup list with a filter).

### Detail page

`dl` card 課程群組資料 with 主代碼 / 群組說明. Toolbar: 返回, 編輯.

### Form page

| Field | Control | Validation |
|-------|---------|-----------|
| 主代碼 | read-only text, edit mode only (hidden in add mode) | — (IDENTITY) |
| 群組說明 | `input pInputText` | required, maxLength 100 |

No lookups → no `forkJoin`; edit mode loads the record by id. Sticky `p-toolbar` with 取消 / 儲存 (same header pattern as Partner).

### Sidebar

**Existing group** `課程管理 Course` in `navGroups` (`app.ts`) — add after 合作廠商 Partner:

```ts
{ label: '課程群組 CourseGroup', icon: 'pi-sitemap', route: '/course-groups' },
```

`app.html` renders `navGroups` generically — no template change needed.

---

## Tests

### Backend (`src\CMS.API.Tests`)

Same style as `PartnersApiTests`: real HTTP pipeline via `WebApplicationFactory<Program>` with `FakeCourseGroupRepository` (in-memory, assigns incrementing pkid on create, carries a settable `InUsePkids` set so the 409 path is testable) replacing `ICourseGroupRepository`.

- `GetAll` returns seeded rows in `pkid` order
- `Query` by keyword matching Description; empty filter returns all
- `GetById` found → 200, missing → 404, non-numeric → 404
- `Create` valid → 201 + Location + generated pkid; trims Description; blank Description → 400; Description over 100 chars → 400
- `Update` existing → 200 and persisted; missing → 404
- `Delete` existing → 204 then 404; missing → 404; **in use → 409 and row still exists**
- `Lookups` `/api/lookups/coursegroups` returns `{pkid, description}` list in pkid order

### Frontend (`src\CMS.NG`)

- `course-group.service.spec.ts` — every method hits the right URL/verb (`HttpTestingController`)
- `course-group-list.spec.ts` — renders rows, keyword filter persists to session storage, sort/page persist, navigation, delete after confirm, 409 message
- `course-group-detail.spec.ts` — loads by route id, renders fields, edit/back navigation
- `course-group-form.spec.ts` — add: required validation, maxLength, create payload (trimmed, pkid 0); edit: loads record, pkid shown read-only, update payload, cancel
- `app.spec.ts` — sidebar shows the 課程群組 CourseGroup entry under 課程管理 Course

---

## Files to Create / Modify

| Area | File | Action |
|------|------|--------|
| Backend | `src/CMS.API/Models/CourseGroup.cs` | create |
| Backend | `src/CMS.API/Models/CourseGroupRequest.cs` | create |
| Backend | `src/CMS.API/Models/CourseGroupQuery.cs` | create |
| Backend | `src/CMS.API/Models/CourseGroupLookup.cs` | create |
| Backend | `src/CMS.API/Repositories/ICourseGroupRepository.cs` | create |
| Backend | `src/CMS.API/Repositories/CourseGroupRepository.cs` | create |
| Backend | `src/CMS.API/Controllers/CourseGroupsController.cs` | create |
| Backend | `src/CMS.API/Controllers/LookupsController.cs` | modify — add `coursegroups` |
| Backend | `src/CMS.API/Program.cs` | modify — DI registration |
| Tests | `src/CMS.API.Tests/FakeCourseGroupRepository.cs` | create |
| Tests | `src/CMS.API.Tests/CourseGroupsApiTests.cs` | create |
| Frontend | `src/CMS.NG/src/app/features/course-groups/course-group.model.ts` | create |
| Frontend | `.../course-groups/course-group.service.ts` + `.spec.ts` | create |
| Frontend | `.../course-groups/course-group-list/` (ts, html, spec) | create |
| Frontend | `.../course-groups/course-group-detail/` (ts, html, spec) | create |
| Frontend | `.../course-groups/course-group-form/` (ts, html, spec) | create |
| Frontend | `src/CMS.NG/src/app/app.routes.ts` | modify — lazy routes |
| Frontend | `src/CMS.NG/src/app/app.ts` | modify — nav entry |
| Frontend | `src/CMS.NG/src/app/app.spec.ts` | modify — sidebar test |
| Docs | `CLAUDE.md` | modify — Features list |
