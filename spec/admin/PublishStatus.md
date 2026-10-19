# Build Spec for PublishStatus
- database schema: `.\database\admin.sql`

---

## Summary

`PublishStatus` is a small reference (code) table that classifies the publishing state of content such as courses and promotions. Each row has a short description and three independent flags (`IsDraft`, `IsPublished`, `IsDiscontinued`). It is referenced as an FK target by `Course.PublishStatus_pkid` and `Promotion2.PublishStatus_pkid`.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **tinyint NOT NULL — not IDENTITY**. The key is supplied by the user on create (same handling as `AppRole.RoleId`: `POST` checks for duplicates → 409; key field is locked in edit mode). |
| Foreign Keys | None |
| Required Fields | `pkid`, `Description`, `IsDraft`, `IsPublished`, `IsDiscontinued` (all NOT NULL) |
| N-N Relationships | N/A |
| Primary-Foreign Links | `Course.PublishStatus_pkid`, `Promotion2.PublishStatus_pkid` (features not yet built — see section below) |
| Query Filters | keyword (Description), IsDraft, IsPublished, IsDiscontinued (tri-state) |
| Default Sort | `pkid ASC` |

---

## Localization

### Chinese Table Name

- PublishStatus: 發布狀態
- Description: 內容（課程、推廣活動）的發布狀態代碼表

### Chinese Column Names

- pkid: 主代碼
- Description: 狀態說明
- IsDraft: 草稿
- IsPublished: 已發布
- IsDiscontinued: 已停用

---

## Required Fields

Required (NOT NULL):
- `pkid` tinyint — user-supplied, 0–255, unique
- `Description` nvarchar(50)
- `IsDraft` bit
- `IsPublished` bit
- `IsDiscontinued` bit

Optional (nullable):
- none

---

## Foreign Keys

**N/A** — `PublishStatus` has no foreign key columns.

---

## Foreign-Primary Links

**N/A**

---

## Primary-Foreign Links

The following tables reference `PublishStatus.pkid`:

| Child table | FK column | Would link to |
|-------------|-----------|---------------|
| `Course` (course.sql) | `PublishStatus_pkid` | `/courses?publishStatusPkid={pkid}` |
| `Promotion2` (promotion.sql) | `PublishStatus_pkid` | `/promotions?publishStatusPkid={pkid}` |

Neither the Course nor the Promotion2 feature exists in the app yet, so **no link buttons are rendered for now**. When those features are built, add 「查看課程」(`pi pi-book`) and 「查看推廣活動」(`pi pi-megaphone`) buttons to the list and detail pages using the routes above, and have each child list accept the `publishStatusPkid` query param.

Because of these FKs, deleting a status that is in use fails at the DB level. The API maps SQL error 547 (FK violation) to **409 Conflict** so the UI can show a meaningful message instead of a 500.

---

## N-N Relationships

**N/A**

---

## Query Filters

- **keyword**: string
  - LIKE on `Description`

- **IsDraft**: bool?
  - Exact match on `IsDraft`; null = no filter

- **IsPublished**: bool?
  - Exact match on `IsPublished`; null = no filter

- **IsDiscontinued**: bool?
  - Exact match on `IsDiscontinued`; null = no filter

No date columns → no date-range filters.

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/publishstatuses` | **New** | `{ pkid, description }[]` ordered by `pkid ASC` — for Course / Promotion2 dropdowns later |

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/publishstatuses` | List all, `ORDER BY pkid` |
| `POST` | `/api/publishstatuses/query` | Filtered query (body: `PublishStatusQuery`) |
| `GET` | `/api/publishstatuses/{id:int}` | Get by pkid; 404 if missing |
| `POST` | `/api/publishstatuses` | Create; **409** if `pkid` already exists; 201 + Location |
| `PUT` | `/api/publishstatuses` | Update (pkid from body); 404 if missing |
| `DELETE` | `/api/publishstatuses/{id:int}` | Delete; 404 if missing; **409** if referenced by Course/Promotion2 |
| `GET` | `/api/lookups/publishstatuses` | Slim lookup list |

Auth exceptions: none.

---

## Backend Notes

### Models

```csharp
public class PublishStatus
{
    public byte Pkid { get; set; }
    public string Description { get; set; } = "";
    public bool IsDraft { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDiscontinued { get; set; }
}

public class PublishStatusRequest
{
    public byte Pkid { get; set; }                       // user-supplied key (not IDENTITY)

    [Required, StringLength(50)]
    public string Description { get; set; } = "";

    public bool IsDraft { get; set; }
    public bool IsPublished { get; set; }
    public bool IsDiscontinued { get; set; }
}

public class PublishStatusQuery
{
    /// <summary>Matches Description (contains).</summary>
    public string? Keyword { get; set; }
    public bool? IsDraft { get; set; }
    public bool? IsPublished { get; set; }
    public bool? IsDiscontinued { get; set; }
}

public class PublishStatusLookup
{
    public byte Pkid { get; set; }
    public string Description { get; set; } = "";
}
```

### SQL — SELECT

```sql
SELECT s.pkid AS Pkid, s.Description, s.IsDraft, s.IsPublished, s.IsDiscontinued
FROM PublishStatus s
-- GetAll / Query: ORDER BY s.pkid
-- GetById:        WHERE s.pkid = @pkid
```

No JOINs, no multi-map, no `nchar` columns (no `RTRIM()` needed).

### SQL — INSERT

```sql
INSERT INTO PublishStatus (pkid, Description, IsDraft, IsPublished, IsDiscontinued)
VALUES (@Pkid, @Description, @IsDraft, @IsPublished, @IsDiscontinued);
```

No `SCOPE_IDENTITY()` — the key comes from the request. The controller calls `ExistsAsync` first and returns 409 on a duplicate.

### SQL — UPDATE

```sql
UPDATE PublishStatus
SET Description = @Description, IsDraft = @IsDraft, IsPublished = @IsPublished, IsDiscontinued = @IsDiscontinued
WHERE pkid = @Pkid;
-- 0 rows affected → 404
```

### SQL — DELETE

```sql
DELETE FROM PublishStatus WHERE pkid = @pkid;
-- 0 rows → 404; SqlException 547 (FK violation from Course / Promotion2) → 409
```

### N-N Sync Pattern

N/A

### Special Column Notes

- `pkid` is `tinyint` → C# `byte`. Dapper maps `tinyint ↔ byte` natively. Route uses `{id:int}`; binding a value outside 0–255 to the `byte` parameter yields an automatic 400.
- No `nchar`, no computed columns, no date/time columns.
- **RowAudit**: the schema has a `RowAudit` table but the project has no audit writer yet and `AppRole` does not log. Not implemented here; add when an audit infrastructure is introduced.

---

## Frontend Notes

### Routes

| Route | Component |
|-------|-----------|
| `/publish-statuses` | `PublishStatusList` |
| `/publish-statuses/new` | `PublishStatusForm` (add) — **must precede `:id`** |
| `/publish-statuses/:id/edit` | `PublishStatusForm` (edit) |
| `/publish-statuses/:id` | `PublishStatusDetail` |

### Angular model (`features/publish-statuses/publish-status.model.ts`)

```ts
export interface PublishStatus {
  pkid: number;
  description: string;
  isDraft: boolean;
  isPublished: boolean;
  isDiscontinued: boolean;
}
export type PublishStatusRequest = PublishStatus;
export interface PublishStatusQuery {
  keyword?: string | null;
  isDraft?: boolean | null;
  isPublished?: boolean | null;
  isDiscontinued?: boolean | null;
}
export interface PublishStatusLookup { pkid: number; description: string; }
```

Service (`publish-status.service.ts`): `getAll`, `query`, `get(id: number)`, `create`, `update`, `delete(id: number)`, `getLookups`. Numeric PK → no `encodeURIComponent`.

### List page

- Title: 發布狀態 PublishStatus
- Columns (all sortable): 主代碼 · 狀態說明 · 草稿 · 已發布 · 已停用 · 操作 (檢視 / 編輯 / 刪除)
- Bool columns render a `p-tag` 是 (success) / 否 (secondary).
- Filter drawer (`p-drawer`, right): 關鍵字 (`input pInputText`), 草稿 / 已發布 / 已停用 (`p-select` 是/否 with `[showClear]`, placeholder 全部, `appendTo="body"`).
- Default sort `pkid ASC`; page size 20.

### Delete Confirmation Message

```
確定要刪除主代碼 <b>${item.pkid}</b>「${item.description}」？
```

On 409 show: 此狀態已被課程或推廣活動使用，無法刪除。

### Session Storage Keys

| Key | Contents |
|-----|----------|
| `publishstatus-list-filters` | Last query filter values |
| `publishstatus-list-sort` | `{ field, order }` |
| `publishstatus-list-page` | `{ first, rows }` |

No incoming cross-entity query params yet.

### Detail page

`dl` card 發布狀態資料 with 主代碼 / 狀態說明 / 草稿 / 已發布 / 已停用 (flags as `p-tag`). Toolbar: 返回, 編輯.

### Form page

| Field | Control | Validation |
|-------|---------|-----------|
| 主代碼 | `p-inputnumber` (min 0, max 255, no grouping) | required; **disabled in edit mode** (read with `getRawValue()`) |
| 狀態說明 | `input pInputText` | required, maxLength 50 |
| 草稿 | `p-checkbox [binary]="true"` | — |
| 已發布 | `p-checkbox [binary]="true"` | — |
| 已停用 | `p-checkbox [binary]="true"` | — |

No lookups → no `forkJoin` needed on init in add mode; edit mode loads the record by id. On 409 from create: 主代碼「{pkid}」已存在.

### Sidebar

Existing group **系統管理 Admin** → add `{ label: '發布狀態 PublishStatus', icon: 'pi-flag', route: '/publish-statuses' }` after 角色 AppRole.

---

## Tests

### Backend (`src\CMS.API.Tests`)

Same style as `AppRolesApiTests`: real HTTP pipeline via `WebApplicationFactory<Program>` with `FakePublishStatusRepository` (in-memory) replacing `IPublishStatusRepository`.

- `GetAll` returns all seeded rows in pkid order
- `Query` by keyword / by `IsPublished` / empty filter
- `GetById` found → 200, missing → 404
- `Create` valid → 201 + Location; duplicate pkid → 409; blank Description → 400
- `Update` existing → 200 and persisted; missing → 404
- `Delete` existing → 204 then 404; missing → 404
- `Lookups` `/api/lookups/publishstatuses` returns `{pkid, description}` list

### Frontend (`src\CMS.NG`)

- `publish-status.service.spec.ts` — every method hits the right URL/verb (`HttpTestingController`)
- `publish-status-list.spec.ts` — renders rows, filters persist to session storage, sort/page persist, navigation, delete after confirm
- `publish-status-detail.spec.ts` — loads by route id, renders fields, edit/back navigation
- `publish-status-form.spec.ts` — add: required validation, create payload, 409 stays; edit: loads record, locks pkid, update payload, cancel
- `app.spec.ts` — sidebar shows the new entry

---

## Files to Create / Modify

| Area | File | Action |
|------|------|--------|
| Backend | `src/CMS.API/Models/PublishStatus.cs` | create |
| Backend | `src/CMS.API/Models/PublishStatusRequest.cs` | create |
| Backend | `src/CMS.API/Models/PublishStatusQuery.cs` | create |
| Backend | `src/CMS.API/Models/PublishStatusLookup.cs` | create |
| Backend | `src/CMS.API/Repositories/IPublishStatusRepository.cs` | create |
| Backend | `src/CMS.API/Repositories/PublishStatusRepository.cs` | create |
| Backend | `src/CMS.API/Controllers/PublishStatusesController.cs` | create |
| Backend | `src/CMS.API/Controllers/LookupsController.cs` | modify — add `publishstatuses` |
| Backend | `src/CMS.API/Program.cs` | modify — DI registration |
| Tests | `src/CMS.API.Tests/FakePublishStatusRepository.cs` | create |
| Tests | `src/CMS.API.Tests/PublishStatusesApiTests.cs` | create |
| Frontend | `src/CMS.NG/src/app/features/publish-statuses/publish-status.model.ts` | create |
| Frontend | `.../publish-statuses/publish-status.service.ts` + `.spec.ts` | create |
| Frontend | `.../publish-statuses/publish-status-list/` (ts, html, spec) | create |
| Frontend | `.../publish-statuses/publish-status-detail/` (ts, html, spec) | create |
| Frontend | `.../publish-statuses/publish-status-form/` (ts, html, spec) | create |
| Frontend | `src/CMS.NG/src/app/app.routes.ts` | modify — lazy routes |
| Frontend | `src/CMS.NG/src/app/app.ts` | modify — sidebar entry |
| Frontend | `src/CMS.NG/src/app/app.spec.ts` | modify — sidebar test |
| Docs | `CLAUDE.md` | modify — Features list |
