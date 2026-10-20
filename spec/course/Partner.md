# Build Spec for Partner
- database schema: `.\database\course.sql`

---

## Summary

`Partner` is a small reference table of the training partners (vendors / brands such as Microsoft, Cisco, …) whose courses the centre offers. Each partner has an internal `Name`, a short `AppKey` code used by the public site, two display-name variants (one for the partner menu, one for the course detail page), a `DisplayOrder`, and an optional logo `ImageFilename`. It is the parent of `Course`, `Certification` and `PartnerCourseGroup`, and is optionally referenced by `Promotion2` and `Seminar`.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` **smallint IDENTITY** → C# `short` |
| Foreign Keys | None |
| Required Fields | `Name`, `AppKey`, `NameOnPartnerMenu`, `NameOnCourseDetailPage`, `DisplayOrder` |
| N-N Relationships | N/A — `PartnerCourseGroup` has its own `pkid`, `DisplayOrder`, `Description` and is itself an FK target of `Promotion2`, so it is treated as a child entity, not a junction (see below) |
| Primary-Foreign Links | `Course.Partner_pkid`, `Certification.Partner_pkid`, `PartnerCourseGroup.Partner_pkid`, `Promotion2.RelatedPartner_pkid` (nullable), `Seminar.Partner_pkid` (nullable, **no FK constraint**) — none of these features exist yet |
| Query Filters | keyword (Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage) |
| Default Sort | `DisplayOrder ASC, pkid ASC` |

---

## Localization

### Chinese Table Name

- Partner: 合作廠商
- Description: 提供課程的合作廠商／原廠主檔

### Chinese Column Names

- pkid: 主代碼
- Name: 廠商名稱
- AppKey: 關鍵字
- NameOnPartnerMenu: 選單顯示名稱
- NameOnCourseDetailPage: 課程頁顯示名稱
- DisplayOrder: 顯示順序
- ImageFilename: 圖片檔名

---

## Required Fields

Required (NOT NULL):
- `Name` nvarchar(50)
- `AppKey` varchar(10) — ASCII code; trim on save
- `NameOnPartnerMenu` nvarchar(200)
- `NameOnCourseDetailPage` nvarchar(50)
- `DisplayOrder` int

Optional (nullable):
- `ImageFilename` varchar(50) — empty string is stored as `NULL`

---

## Foreign Keys

**N/A** — `Partner` has no foreign key columns.

---

## Foreign-Primary Links

**N/A**

---

## Primary-Foreign Links

The following tables reference `Partner.pkid`:

| Child table | FK column | Nullable | Column header | Button | Would link to |
|-------------|-----------|----------|---------------|--------|---------------|
| `Course` (course.sql) | `Partner_pkid` | no | 對應課程 | 查看課程 `pi pi-book` | `/courses?partnerPkid={pkid}` |
| `Certification` (course.sql) | `Partner_pkid` | no | 對應認證 | 查看認證 `pi pi-verified` | `/certifications?partnerPkid={pkid}` |
| `PartnerCourseGroup` (course.sql) | `Partner_pkid` | no | 對應課程群組 | 查看課程群組 `pi pi-sitemap` | `/partner-course-groups?partnerPkid={pkid}` |
| `Promotion2` (promotion.sql) | `RelatedPartner_pkid` | yes | 對應推廣活動 | 查看推廣活動 `pi pi-megaphone` | `/promotions?relatedPartnerPkid={pkid}` |
| `Seminar` (promotion.sql) | `Partner_pkid` | yes (no FK constraint) | 對應研討會 | 查看研討會 `pi pi-users` | `/seminars?partnerPkid={pkid}` |

None of these features exist in the app yet, so **no link buttons are rendered for now**. When each child feature is built, add its button to the Partner list (操作 column) and detail toolbar using the route above, and have the child list accept the query param named in the route (`partnerPkid` / `relatedPartnerPkid`), overriding its saved filter state.

Because of the four real FK constraints, deleting a partner that is in use fails at the DB level. The API maps SQL error 547 (FK violation) to **409 Conflict** (same pattern as `PublishStatus`) so the UI can show a meaningful message.

---

## N-N Relationships

**N/A**

`PartnerCourseGroup` (`pkid` int IDENTITY, `Partner_pkid`, `CourseGroup_pkid`, `DisplayOrder`, `Description`) looks like a Partner ↔ CourseGroup junction, but:

- it has its own IDENTITY `pkid` that `Promotion2.RelatedPartnerCourseGroup_pkid` references — the delete-then-reinsert sync pattern would break those FKs and churn the keys;
- it carries two data columns (`DisplayOrder`, `Description`) that need per-row editing.

It is therefore a **child entity** with its own future CRUD (`spec/course/PartnerCourseGroup.md`), linked from Partner via the Primary-Foreign table above. The Partner form has no multiselect.

---

## Query Filters

- **keyword**: string
  - LIKE on `Name`, `AppKey`, `NameOnPartnerMenu`, `NameOnCourseDetailPage` (all short identifying strings)
  - `ImageFilename` is excluded (not an identifying field)

No FK columns → no dropdown filters. No bit columns → no bool filters. No date columns → no date-range filters.

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/partners` | **New** | `{ pkid, name }[]` ordered by `DisplayOrder ASC, pkid ASC` — for Course / Certification / PartnerCourseGroup / Promotion2 / Seminar dropdowns later |

Route name follows the existing no-hyphen convention (`/api/lookups/publishstatuses`, `/api/lookups/appusers`).

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/partners` | List all, `ORDER BY DisplayOrder, pkid` |
| `POST` | `/api/partners/query` | Filtered query (body: `PartnerQuery`) |
| `GET` | `/api/partners/{id:int}` | Get by pkid; 404 if missing |
| `POST` | `/api/partners` | Create; 201 + Location; returns the row with the generated pkid |
| `PUT` | `/api/partners` | Update (pkid from body); 404 if missing |
| `DELETE` | `/api/partners/{id:int}` | Delete; 404 if missing; **409** if referenced by Course / Certification / PartnerCourseGroup / Promotion2 |
| `GET` | `/api/lookups/partners` | Slim lookup list |

Auth exceptions: none.

Controller trims `Name`, `AppKey`, `NameOnPartnerMenu`, `NameOnCourseDetailPage` and normalises blank `ImageFilename` to `null` before calling the repository.

---

## Backend Notes

### Models

```csharp
public class Partner
{
    public short Pkid { get; set; }
    public string Name { get; set; } = "";
    public string AppKey { get; set; } = "";
    public string NameOnPartnerMenu { get; set; } = "";
    public string NameOnCourseDetailPage { get; set; } = "";
    public int DisplayOrder { get; set; }
    public string? ImageFilename { get; set; }
}

public class PartnerRequest
{
    public short Pkid { get; set; }                      // ignored on POST (IDENTITY)

    [Required, StringLength(50)]
    public string Name { get; set; } = "";

    [Required, StringLength(10)]
    public string AppKey { get; set; } = "";

    [Required, StringLength(200)]
    public string NameOnPartnerMenu { get; set; } = "";

    [Required, StringLength(50)]
    public string NameOnCourseDetailPage { get; set; } = "";

    public int DisplayOrder { get; set; }

    [StringLength(50)]
    public string? ImageFilename { get; set; }
}

public class PartnerQuery
{
    /// <summary>Matches Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage (contains).</summary>
    public string? Keyword { get; set; }
}

public class PartnerLookup
{
    public short Pkid { get; set; }
    public string Name { get; set; } = "";
}
```

### SQL — SELECT

```sql
SELECT p.pkid AS Pkid, p.Name, p.AppKey, p.NameOnPartnerMenu,
       p.NameOnCourseDetailPage, p.DisplayOrder, p.ImageFilename
FROM Partner p
-- GetAll:  ORDER BY p.DisplayOrder, p.pkid
-- Query:   WHERE (p.Name LIKE @Keyword OR p.AppKey LIKE @Keyword
--                 OR p.NameOnPartnerMenu LIKE @Keyword OR p.NameOnCourseDetailPage LIKE @Keyword)
--          ORDER BY p.DisplayOrder, p.pkid
-- GetById: WHERE p.pkid = @pkid
```

No JOINs, no multi-map, no `nchar` columns (no `RTRIM()` needed).

### SQL — INSERT

```sql
INSERT INTO Partner (Name, AppKey, NameOnPartnerMenu, NameOnCourseDetailPage, DisplayOrder, ImageFilename)
VALUES (@Name, @AppKey, @NameOnPartnerMenu, @NameOnCourseDetailPage, @DisplayOrder, @ImageFilename);
SELECT CAST(SCOPE_IDENTITY() AS smallint);
```

### SQL — UPDATE

```sql
UPDATE Partner
SET Name = @Name, AppKey = @AppKey, NameOnPartnerMenu = @NameOnPartnerMenu,
    NameOnCourseDetailPage = @NameOnCourseDetailPage, DisplayOrder = @DisplayOrder,
    ImageFilename = @ImageFilename
WHERE pkid = @Pkid;
-- 0 rows affected → 404
```

### SQL — DELETE

```sql
DELETE FROM Partner WHERE pkid = @pkid;
-- 0 rows → 404; SqlException 547 (FK violation) → 409
```

### SQL — Lookup

```sql
SELECT pkid AS Pkid, Name FROM Partner ORDER BY DisplayOrder, pkid
```

### N-N Sync Pattern

N/A

### Special Column Notes

- `pkid` is `smallint IDENTITY` → C# `short`; `SCOPE_IDENTITY()` cast to `smallint`. Route uses `{id:int}`; out-of-range values fail model binding to the `short` parameter with a 400.
- `AppKey` / `ImageFilename` are `varchar` (non-Unicode). Dapper sends `string` as `nvarchar`; this is fine for equality/LIKE on such small tables, no `DbString` needed.
- No `nchar`, no computed columns, no date/time columns.
- **RowAudit**: the project has no audit writer yet (`AppRole` and `PublishStatus` do not log). Not implemented here.

---

## Frontend Notes

### Routes

| Route | Component |
|-------|-----------|
| `/partners` | `PartnerList` |
| `/partners/new` | `PartnerForm` (add) — **must precede `:id`** |
| `/partners/:id/edit` | `PartnerForm` (edit) |
| `/partners/:id` | `PartnerDetail` |

### Angular model (`features/partners/partner.model.ts`)

```ts
export interface Partner {
  pkid: number;
  name: string;
  appKey: string;
  nameOnPartnerMenu: string;
  nameOnCourseDetailPage: string;
  displayOrder: number;
  imageFilename: string | null;
}
export type PartnerRequest = Partner;
export interface PartnerQuery {
  keyword?: string | null;
}
export interface PartnerLookup { pkid: number; name: string; }
```

Service (`partner.service.ts`): `getAll`, `query`, `get(id: number)`, `create`, `update`, `delete(id: number)`, `getLookups`. Numeric PK → no `encodeURIComponent`.

### List page

- Title: 合作廠商 Partner
- Columns (all sortable): 主代碼 · 廠商名稱 · 關鍵字 · 選單顯示名稱 · 課程頁顯示名稱 · 顯示順序 · 圖片檔名 · 操作 (檢視 / 編輯 / 刪除)
- Filter drawer (`p-drawer`, right): 關鍵字 (`input pInputText`) only.
- Default sort `displayOrder ASC`; page size 20.
- No lookups to load → no `forkJoin` on init; restore saved filters immediately.

### Delete Confirmation Message

```
確定要刪除主代碼 <b>${item.pkid}</b>「${item.name}」？
```

On 409 show: 此廠商已被課程、認證、課程群組或推廣活動使用，無法刪除。

### Session Storage Keys

| Key | Contents |
|-----|----------|
| `partner-list-filters` | Last query filter values |
| `partner-list-sort` | `{ field, order }` |
| `partner-list-page` | `{ first, rows }` |

No incoming cross-entity query params (nothing links *into* Partner list with a filter).

### Detail page

`dl` card 合作廠商資料 with 主代碼 / 廠商名稱 / 關鍵字 / 選單顯示名稱 / 課程頁顯示名稱 / 顯示順序 / 圖片檔名 (shown as text; show 「—」 when null). Toolbar: 返回, 編輯.

### Form page

| Field | Control | Validation |
|-------|---------|-----------|
| 主代碼 | read-only text, edit mode only (hidden in add mode) | — (IDENTITY) |
| 廠商名稱 | `input pInputText` | required, maxLength 50 |
| 關鍵字 | `input pInputText` | required, maxLength 10 |
| 選單顯示名稱 | `input pInputText` | required, maxLength 200 |
| 課程頁顯示名稱 | `input pInputText` | required, maxLength 50 |
| 顯示順序 | `p-inputnumber` (no grouping, integers) | required; default `0` in add mode |
| 圖片檔名 | `input pInputText` | optional, maxLength 50; blank → `null` |

No lookups → no `forkJoin` on init in add mode; edit mode loads the record by id. Sticky `p-toolbar` with 返回 / 儲存. No file upload — `ImageFilename` is a plain filename string (no upload infrastructure in the project).

### Sidebar

**New group** `課程管理 Course` (icon `pi-book`), placed after 系統管理 Admin in `navGroups` (`app.ts`):

```ts
{
  label: '課程管理 Course',
  icon: 'pi-book',
  items: [
    { label: '合作廠商 Partner', icon: 'pi-building', route: '/partners' },
  ],
}
```

`app.html` renders `navGroups` generically — no template change needed.

---

## Tests

### Backend (`src\CMS.API.Tests`)

Same style as `PublishStatusesApiTests`: real HTTP pipeline via `WebApplicationFactory<Program>` with `FakePartnerRepository` (in-memory, assigns incrementing pkid on create) replacing `IPartnerRepository`.

- `GetAll` returns seeded rows in `DisplayOrder` order
- `Query` by keyword matching Name / AppKey / NameOnPartnerMenu; empty filter returns all
- `GetById` found → 200, missing → 404
- `Create` valid → 201 + Location + generated pkid; blank Name → 400; AppKey over 10 chars → 400; blank ImageFilename stored as null
- `Update` existing → 200 and persisted; missing → 404
- `Delete` existing → 204 then 404; missing → 404
- `Lookups` `/api/lookups/partners` returns `{pkid, name}` list in DisplayOrder order

### Frontend (`src\CMS.NG`)

- `partner.service.spec.ts` — every method hits the right URL/verb (`HttpTestingController`)
- `partner-list.spec.ts` — renders rows, keyword filter persists to session storage, sort/page persist, navigation, delete after confirm, 409 message
- `partner-detail.spec.ts` — loads by route id, renders fields, null image shows 「—」, edit/back navigation
- `partner-form.spec.ts` — add: required validation, create payload, blank image → null; edit: loads record, pkid shown read-only, update payload, cancel
- `app.spec.ts` — sidebar shows the new 課程管理 Course group and 合作廠商 Partner entry

---

## Files to Create / Modify

| Area | File | Action |
|------|------|--------|
| Backend | `src/CMS.API/Models/Partner.cs` | create |
| Backend | `src/CMS.API/Models/PartnerRequest.cs` | create |
| Backend | `src/CMS.API/Models/PartnerQuery.cs` | create |
| Backend | `src/CMS.API/Models/PartnerLookup.cs` | create |
| Backend | `src/CMS.API/Repositories/IPartnerRepository.cs` | create |
| Backend | `src/CMS.API/Repositories/PartnerRepository.cs` | create |
| Backend | `src/CMS.API/Controllers/PartnersController.cs` | create |
| Backend | `src/CMS.API/Controllers/LookupsController.cs` | modify — add `partners` |
| Backend | `src/CMS.API/Program.cs` | modify — DI registration |
| Tests | `src/CMS.API.Tests/FakePartnerRepository.cs` | create |
| Tests | `src/CMS.API.Tests/PartnersApiTests.cs` | create |
| Frontend | `src/CMS.NG/src/app/features/partners/partner.model.ts` | create |
| Frontend | `.../partners/partner.service.ts` + `.spec.ts` | create |
| Frontend | `.../partners/partner-list/` (ts, html, spec) | create |
| Frontend | `.../partners/partner-detail/` (ts, html, spec) | create |
| Frontend | `.../partners/partner-form/` (ts, html, spec) | create |
| Frontend | `src/CMS.NG/src/app/app.routes.ts` | modify — lazy routes |
| Frontend | `src/CMS.NG/src/app/app.ts` | modify — new nav group + entry |
| Frontend | `src/CMS.NG/src/app/app.spec.ts` | modify — sidebar test |
| Docs | `docs/features.md` | modify — append feature entry |
