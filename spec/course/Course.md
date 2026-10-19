# Build Spec for Course
- database schema: `.\database\course.sql`

---

## Summary

`Course` is the main catalogue entity: one row per course offered (title, public/production codes, friendly URL, partner, group, publish status, schedule window, hours, price, credits, long-text descriptions). It references `Partner`, `CourseGroup` (optional) and `PublishStatus`, has two n-n links (`Certification` via `CourseInCertification`, `JobCategory` via `CourseJobCategories`), and is the parent of `CourseFAQ`, `CourseRelatedLink` and `HotCourse`. The live table has ~1,084 rows.

| Item | Detail |
|------|--------|
| Primary Key | `pkid` int IDENTITY → C# `int` |
| Foreign Keys | `Partner_pkid` → `Partner.pkid` (smallint, required); `CourseGroup_pkid` → `CourseGroup.pkid` (smallint, **nullable**); `PublishStatus_pkid` → `PublishStatus.pkid` (tinyint, required) |
| Required Fields | `Title`, `CourseId`, `ProdCourseId`, `FriendlyUrl`, `DisplayOrder`, `Partner_pkid`, `PublishStatus_pkid`, `ScheduleOn`, `ScheduleOff`, `Hour`, `ListPrice`, `LearningCredit`, `CanRepeat` |
| N-N Relationships | `CourseInCertification` (Course ↔ Certification), `CourseJobCategories` (Course ↔ JobCategory) |
| Primary-Foreign Links | `CourseFAQ.Course_pkid`, `CourseRelatedLink.Course_pkid`, `HotCourse.Course_pkid` — none of these features exist yet |
| Query Filters | keyword; Partner / CourseGroup / PublishStatus dropdowns; CanRepeat tri-state; ScheduleOn and ScheduleOff date ranges |
| Default Sort | `DisplayOrder ASC, pkid ASC` |

---

## Localization

### Chinese Table Name

- Course: 課程
- Description: 課程主檔（名稱、代碼、原廠、群組、上架狀態、排程、時數、定價、點數與各項說明）

### Chinese Column Names

Labels follow the list-page hints supplied with the `/crud` call; the rest are inferred.

- pkid: 主代碼
- Title: 課程名稱
- OfficialTitle: 原廠課程名稱
- CourseId: 簡介代碼
- ProdCourseId: 科目代碼
- FriendlyUrl: 網址別名
- DisplayOrder: 顯示順序
- Partner_pkid: 原廠
- CourseGroup_pkid: 課程群組
- PublishStatus_pkid: 上架狀態
- ScheduleOn: 上架日期
- ScheduleOff: 下架日期
- Hour: 時數
- ListPrice: 定價
- LearningCredit: 點數
- Material: 教材
- Objective: 課程目標
- Target: 適合對象
- Prerequisites: 先備知識
- Outline: 課程大綱
- TowardCertOrExam: 對應認證／考試
- Note: 備註
- OtherInfo: 其他資訊
- CanRepeat: 允許重聽
- (n-n) Certifications: 對應認證
- (n-n) JobCategories: 職務類別

---

## Required Fields

Required (NOT NULL):
- `Title` nvarchar(200)
- `CourseId` varchar(50) — ASCII code
- `ProdCourseId` varchar(50) — ASCII code
- `FriendlyUrl` nvarchar(100)
- `DisplayOrder` int
- `Partner_pkid` smallint
- `PublishStatus_pkid` tinyint
- `ScheduleOn` date, `ScheduleOff` date — `ScheduleOff` must be ≥ `ScheduleOn` (API returns 400 otherwise)
- `Hour` smallint (default 0)
- `ListPrice` decimal(9,0) (default 0)
- `LearningCredit` decimal(9,1) (default 0)
- `CanRepeat` bit (default 0)

Optional (nullable):
- `OfficialTitle` nvarchar(300)
- `CourseGroup_pkid` smallint
- `Material` nvarchar(500), `Target` nvarchar(500)
- `Objective`, `Prerequisites`, `Note`, `OtherInfo` nvarchar(4000)
- `Outline`, `TowardCertOrExam` nvarchar(max)

Blank optional strings are stored as `NULL`.

---

## Foreign Keys

| Column | → Table.PK | Nullable | Option label | Lookup order | Lookup |
|--------|-----------|----------|--------------|--------------|--------|
| `Partner_pkid` | `Partner.pkid` (smallint) | no | `Name` | `DisplayOrder, pkid` | `/api/lookups/partners` (exists) |
| `CourseGroup_pkid` | `CourseGroup.pkid` (smallint) | **yes** — dropdown has clear ("無") | `Description` | `pkid` | `/api/lookups/coursegroups` (exists) |
| `PublishStatus_pkid` | `PublishStatus.pkid` (tinyint) | no | `Description` | `pkid` | `/api/lookups/publishstatuses` (exists) |

Aliases: `Partner_pkid AS PartnerPkid`, `CourseGroup_pkid AS CourseGroupPkid`, `PublishStatus_pkid AS PublishStatusPkid`.

The response model carries both the raw pkids (for the form) and nav objects `partner { pkid, name }`, `courseGroup { pkid, description } | null`, `publishStatus { pkid, description }` (for list/detail display and list sorting on `partner.name` etc.), loaded by Dapper multi-map. The nav objects reuse the existing `PartnerLookup` / `CourseGroupLookup` / `PublishStatusLookup` classes.

---

## Foreign-Primary Links

Shown in list (FK columns are plain text for now) and detail pages:

| FK | Link target | Condition |
|----|-------------|-----------|
| `Partner_pkid` | `/partners/{partnerPkid}` | always |
| `CourseGroup_pkid` | `/course-groups/{courseGroupPkid}` | only when not null |
| `PublishStatus_pkid` | `/publish-statuses/{publishStatusPkid}` | always |

Detail page renders each FK value as a router link to the parent's detail page.

---

## Primary-Foreign Links

| Child table | FK column | On delete | Column header | Button | Would link to |
|-------------|-----------|-----------|---------------|--------|---------------|
| `CourseFAQ` | `Course_pkid` | NO ACTION | 對應常見問題 | 查看常見問題 `pi pi-question-circle` | `/course-faqs?coursePkid={pkid}` |
| `CourseRelatedLink` | `Course_pkid` | NO ACTION | 對應相關連結 | 查看相關連結 `pi pi-link` | `/course-related-links?coursePkid={pkid}` |
| `HotCourse` | `Course_pkid` | NO ACTION | 對應熱門課程 | 查看熱門課程 `pi pi-star` | `/hot-courses?coursePkid={pkid}` |

None of these features exist, so **no buttons are rendered yet**. Query param convention: `coursePkid`.

`CourseRecomm` references courses by the `CourseId` string with no FK constraint — ignored.

### Incoming links (this feature is the child)

The Course list accepts `?partnerPkid=`, `?courseGroupPkid=` and `?publishStatusPkid=` query params. When present they **override** the saved filter state (the other saved filters are cleared) and are persisted as the new filters. The Partner, CourseGroup and PublishStatus list (操作 column) and detail toolbars gain a 查看課程 `pi pi-book` button pointing to `/courses?{param}={pkid}`, as those specs deferred.

### Delete

`DeleteAsync` runs in a transaction: delete `CourseInCertification` and `CourseJobCategories` rows (they cascade anyway, but explicit is clearer), then the course. A course still referenced by `CourseFAQ` / `CourseRelatedLink` / `HotCourse` raises SQL error 547 → **409 Conflict**. UI message: 此課程已被常見問題、相關連結或熱門課程使用，無法刪除。

---

## N-N Relationships

### Certification via `CourseInCertification`

- Junction: `CourseInCertification (Course_pkid int, Certification_pkid int)`, PK on both.
- Related entity: `Certification` (`pkid` int, `Partner_pkid`, `Title` **nchar(100)** → `RTRIM`). ~39 rows. No Certification feature exists, so the lookup lives on the Course repository (same precedent as `AppRole.GetUserLookupsAsync`).
- Lookup: `GET /api/lookups/certifications` → `{ pkid, title, partnerPkid }[]` ordered by `Title`.
- List: column 認證數 is not shown (keep the wide table manageable); the response carries `certificationCount`.
- Detail: chips of certification titles resolved from the lookup.
- Form: `p-multiselect` (display chip, `[maxSelectedLabels]="9999"`, filter). Options are **not** filtered by the chosen partner so existing cross-partner links stay visible.
- Request field: `CertificationPkids: List<int>`.

### JobCategory via `CourseJobCategories`

- Junction: `CourseJobCategories (Course_pkid int, JobCategory_pkid smallint)`, PK on both.
- Related entity: `JobCategory` (`pkid` smallint, `Description` nvarchar(70)). ~18 rows.
- Lookup: `GET /api/lookups/jobcategories` → `{ pkid, description }[]` ordered by `pkid`.
- Detail: chips of descriptions. Form: `p-multiselect`. Response carries `jobCategoryCount`.
- Request field: `JobCategoryPkids: List<short>`.

Sync pattern on create/update (inside the same transaction as the INSERT/UPDATE):
```sql
DELETE FROM CourseInCertification WHERE Course_pkid = @Pkid;
INSERT INTO CourseInCertification (Course_pkid, Certification_pkid) VALUES (@Pkid, @CertificationPkid); -- per id
DELETE FROM CourseJobCategories WHERE Course_pkid = @Pkid;
INSERT INTO CourseJobCategories (Course_pkid, JobCategory_pkid) VALUES (@Pkid, @JobCategoryPkid);        -- per id
```

---

## Query Filters

- **keyword**: LIKE on `Title`, `OfficialTitle`, `CourseId`, `ProdCourseId`, `FriendlyUrl`. Long-text columns are excluded.
- **PartnerPkid** (short?): exact match; dropdown from `/api/lookups/partners`, label `name`, `[filter]="true"` (66 rows).
- **CourseGroupPkid** (short?): exact match; dropdown from `/api/lookups/coursegroups`, label `description`, `[filter]="true" [virtualScroll]="true" [virtualScrollItemSize]="43"` (215 rows).
- **PublishStatusPkid** (byte?): exact match; dropdown from `/api/lookups/publishstatuses`, label `description`.
- **CanRepeat** (bool?): tri-state select 是／否, clear = no filter.
- **ScheduleOnFrom / ScheduleOnTo** (DateOnly?): inclusive range on `ScheduleOn`.
- **ScheduleOffFrom / ScheduleOffTo** (DateOnly?): inclusive range on `ScheduleOff`.

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/partners` | Exists | `{ pkid, name }[]` |
| `GET /api/lookups/coursegroups` | Exists | `{ pkid, description }[]` |
| `GET /api/lookups/publishstatuses` | Exists | `{ pkid, description }[]` |
| `GET /api/lookups/certifications` | **New** | `{ pkid, title, partnerPkid }[]` ordered by `Title` (served by `ICourseRepository.GetCertificationLookupsAsync`) |
| `GET /api/lookups/jobcategories` | **New** | `{ pkid, description }[]` ordered by `pkid` (served by `ICourseRepository.GetJobCategoryLookupsAsync`) |

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/courses` | List all with nav objects, `ORDER BY DisplayOrder, pkid` |
| `POST` | `/api/courses/query` | Filtered query (body: `CourseQuery`) |
| `GET` | `/api/courses/{id:int}` | Get by pkid incl. `certificationPkids` / `jobCategoryPkids`; 404 if missing |
| `POST` | `/api/courses` | Create (+ n-n rows in one transaction); 201 + Location; 400 if `ScheduleOff < ScheduleOn` |
| `PUT` | `/api/courses` | Update (pkid from body, n-n delete-then-reinsert); 404 if missing; 400 on bad date range |
| `DELETE` | `/api/courses/{id:int}` | Delete junction rows + course; 404 if missing; **409** on FK violation (FAQ / RelatedLink / HotCourse) |
| `GET` | `/api/lookups/certifications` | New |
| `GET` | `/api/lookups/jobcategories` | New |

Auth exceptions: none.

Controller `Normalize`: trims all text fields, blank optional text → `null`, distinct n-n ids.

---

## Backend Notes

### Models

```csharp
public class Course
{
    public int Pkid { get; set; }
    public string Title { get; set; } = "";
    public string? OfficialTitle { get; set; }
    public string CourseId { get; set; } = "";
    public string ProdCourseId { get; set; } = "";
    public string FriendlyUrl { get; set; } = "";
    public int DisplayOrder { get; set; }
    public short PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    public byte PublishStatusPkid { get; set; }
    public DateOnly ScheduleOn { get; set; }
    public DateOnly ScheduleOff { get; set; }
    public short Hour { get; set; }
    public decimal ListPrice { get; set; }
    public decimal LearningCredit { get; set; }
    public string? Material { get; set; }
    public string? Objective { get; set; }
    public string? Target { get; set; }
    public string? Prerequisites { get; set; }
    public string? Outline { get; set; }
    public string? TowardCertOrExam { get; set; }
    public string? Note { get; set; }
    public string? OtherInfo { get; set; }
    public bool CanRepeat { get; set; }
    public int CertificationCount { get; set; }      // subquery
    public int JobCategoryCount { get; set; }        // subquery
    public PartnerLookup Partner { get; set; } = new();          // multi-map
    public CourseGroupLookup? CourseGroup { get; set; }          // multi-map, null when FK null
    public PublishStatusLookup PublishStatus { get; set; } = new();
    public List<int> CertificationPkids { get; set; } = new();   // GetById only
    public List<short> JobCategoryPkids { get; set; } = new();   // GetById only
}

public class CourseRequest
{
    public int Pkid { get; set; }
    [Required, StringLength(200)] public string Title { get; set; } = "";
    [StringLength(300)] public string? OfficialTitle { get; set; }
    [Required, StringLength(50)] public string CourseId { get; set; } = "";
    [Required, StringLength(50)] public string ProdCourseId { get; set; } = "";
    [Required, StringLength(100)] public string FriendlyUrl { get; set; } = "";
    public int DisplayOrder { get; set; }
    [Range(1, short.MaxValue)] public short PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    [Range(1, byte.MaxValue)] public byte PublishStatusPkid { get; set; }
    public DateOnly ScheduleOn { get; set; }
    public DateOnly ScheduleOff { get; set; }
    [Range(0, short.MaxValue)] public short Hour { get; set; }
    [Range(0, 999_999_999)] public decimal ListPrice { get; set; }
    [Range(0, 99_999_999.9)] public decimal LearningCredit { get; set; }
    [StringLength(500)] public string? Material { get; set; }
    [StringLength(4000)] public string? Objective { get; set; }
    [StringLength(500)] public string? Target { get; set; }
    [StringLength(4000)] public string? Prerequisites { get; set; }
    public string? Outline { get; set; }
    public string? TowardCertOrExam { get; set; }
    [StringLength(4000)] public string? Note { get; set; }
    [StringLength(4000)] public string? OtherInfo { get; set; }
    public bool CanRepeat { get; set; }
    public List<int> CertificationPkids { get; set; } = new();
    public List<short> JobCategoryPkids { get; set; } = new();
}

public class CourseQuery
{
    public string? Keyword { get; set; }
    public short? PartnerPkid { get; set; }
    public short? CourseGroupPkid { get; set; }
    public byte? PublishStatusPkid { get; set; }
    public bool? CanRepeat { get; set; }
    public DateOnly? ScheduleOnFrom { get; set; }
    public DateOnly? ScheduleOnTo { get; set; }
    public DateOnly? ScheduleOffFrom { get; set; }
    public DateOnly? ScheduleOffTo { get; set; }
}

public class CertificationLookup { public int Pkid; public string Title = ""; public short PartnerPkid; }
public class JobCategoryLookup   { public short Pkid; public string Description = ""; }
```

### SQL — SELECT (multi-map)

```sql
SELECT c.pkid AS Pkid, c.Title, c.OfficialTitle, c.CourseId, c.ProdCourseId, c.FriendlyUrl,
       c.DisplayOrder,
       c.Partner_pkid AS PartnerPkid, c.CourseGroup_pkid AS CourseGroupPkid,
       c.PublishStatus_pkid AS PublishStatusPkid,
       c.ScheduleOn, c.ScheduleOff, c.Hour, c.ListPrice, c.LearningCredit,
       c.Material, c.Objective, c.Target, c.Prerequisites, c.Outline, c.TowardCertOrExam,
       c.Note, c.OtherInfo, c.CanRepeat,
       (SELECT COUNT(*) FROM CourseInCertification x WHERE x.Course_pkid = c.pkid) AS CertificationCount,
       (SELECT COUNT(*) FROM CourseJobCategories  x WHERE x.Course_pkid = c.pkid) AS JobCategoryCount,
       p.pkid AS Pkid, p.Name,                       -- PartnerLookup
       g.pkid AS Pkid, g.Description,                -- CourseGroupLookup (NULL row → null object)
       s.pkid AS Pkid, s.Description                 -- PublishStatusLookup
FROM Course c
JOIN Partner p ON p.pkid = c.Partner_pkid
LEFT JOIN CourseGroup g ON g.pkid = c.CourseGroup_pkid
JOIN PublishStatus s ON s.pkid = c.PublishStatus_pkid
-- splitOn: "Pkid,Pkid,Pkid"
-- ORDER BY c.DisplayOrder, c.pkid
```

GetById additionally runs, on the same connection:
```sql
SELECT Certification_pkid FROM CourseInCertification WHERE Course_pkid = @pkid ORDER BY Certification_pkid;
SELECT JobCategory_pkid   FROM CourseJobCategories  WHERE Course_pkid = @pkid ORDER BY JobCategory_pkid;
```

### SQL — INSERT

```sql
INSERT INTO Course (Title, OfficialTitle, CourseId, ProdCourseId, FriendlyUrl, DisplayOrder,
                    Partner_pkid, CourseGroup_pkid, PublishStatus_pkid, ScheduleOn, ScheduleOff,
                    Hour, ListPrice, LearningCredit, Material, Objective, Target, Prerequisites,
                    Outline, TowardCertOrExam, Note, OtherInfo, CanRepeat)
VALUES (@Title, @OfficialTitle, @CourseId, @ProdCourseId, @FriendlyUrl, @DisplayOrder,
        @PartnerPkid, @CourseGroupPkid, @PublishStatusPkid, @ScheduleOn, @ScheduleOff,
        @Hour, @ListPrice, @LearningCredit, @Material, @Objective, @Target, @Prerequisites,
        @Outline, @TowardCertOrExam, @Note, @OtherInfo, @CanRepeat);
SELECT CAST(SCOPE_IDENTITY() AS int);
-- then n-n sync, all in one transaction
```

### SQL — UPDATE

Same column list in `SET … WHERE pkid = @Pkid`; 0 rows → 404 (transaction rolled back); then n-n sync; commit.

### SQL — DELETE

```sql
DELETE FROM CourseInCertification WHERE Course_pkid = @pkid;
DELETE FROM CourseJobCategories  WHERE Course_pkid = @pkid;
DELETE FROM Course WHERE pkid = @pkid;   -- 0 rows → 404; SqlException 547 → 409
```

### SQL — Lookups

```sql
SELECT c.pkid AS Pkid, RTRIM(c.Title) AS Title, c.Partner_pkid AS PartnerPkid FROM Certification c ORDER BY c.Title;
SELECT pkid AS Pkid, Description FROM JobCategory ORDER BY pkid;
```

### Special Column Notes

- `Certification.Title` is `nchar(100)` → `RTRIM()`.
- `ScheduleOn` / `ScheduleOff` are `date` → `DateOnly` (handler already registered). Serialised as `"yyyy-MM-dd"`.
- `CourseId` / `ProdCourseId` are `varchar`; Dapper sends nvarchar, fine for these sizes.
- `ListPrice` decimal(9,0), `LearningCredit` decimal(9,1) → `decimal`; the form uses `p-inputnumber` with 0 / 1 fraction digits.
- `CanRepeat` bit, DB default 0 → form default unchecked.
- RowAudit: not implemented (project has no audit writer).

---

## Frontend Notes

### Routes

| Route | Component |
|-------|-----------|
| `/courses` | `CourseList` |
| `/courses/new` | `CourseForm` — before `:id` |
| `/courses/:id/edit` | `CourseForm` |
| `/courses/:id` | `CourseDetail` |

### Angular model (`features/courses/course.model.ts`)

```ts
export interface Course {
  pkid: number; title: string; officialTitle: string | null;
  courseId: string; prodCourseId: string; friendlyUrl: string; displayOrder: number;
  partnerPkid: number; courseGroupPkid: number | null; publishStatusPkid: number;
  scheduleOn: string; scheduleOff: string;              // ISO yyyy-MM-dd
  hour: number; listPrice: number; learningCredit: number;
  material: string | null; objective: string | null; target: string | null;
  prerequisites: string | null; outline: string | null; towardCertOrExam: string | null;
  note: string | null; otherInfo: string | null; canRepeat: boolean;
  certificationCount: number; jobCategoryCount: number;
  partner: PartnerLookup; courseGroup: CourseGroupLookup | null; publishStatus: PublishStatusLookup;
  certificationPkids: number[]; jobCategoryPkids: number[];
}
export interface CourseRequest { …all writable fields…; certificationPkids: number[]; jobCategoryPkids: number[]; }
export interface CourseQuery {
  keyword?: string | null; partnerPkid?: number | null; courseGroupPkid?: number | null;
  publishStatusPkid?: number | null; canRepeat?: boolean | null;
  scheduleOnFrom?: string | null; scheduleOnTo?: string | null;
  scheduleOffFrom?: string | null; scheduleOffTo?: string | null;
}
export interface CertificationLookup { pkid: number; title: string; partnerPkid: number; }
export interface JobCategoryLookup { pkid: number; description: string; }
```

Service: `getAll`, `query`, `get`, `create`, `update`, `delete`, `getCertificationLookups`, `getJobCategoryLookups`. Partner / CourseGroup / PublishStatus lookups come from their own services.

### Date Handling

New `core/utils/date.util.ts`: `toIso(d: Date | null): string | null` using local `getFullYear/getMonth/getDate` (never `toISOString`), and `parseIso(s: string | null): Date | null` building `new Date(y, m - 1, d)`. Used by the list filter drawer and the form.

### List page

- Title: 課程 Course
- Columns (all sortable; nav columns sort on `partner.name`, `courseGroup.description`, `publishStatus.description`):
  主代碼 · 顯示順序 · 簡介代碼 · 科目代碼 · 課程名稱 · 原廠 · 課程群組 · 上架狀態 · 上架日期 · 下架日期 · 時數 · 定價 · 點數 · 允許重聽 (tag 是／否) · 操作
- Filter drawer: 關鍵字, 原廠 (`p-select`, filter), 課程群組 (`p-select`, filter + virtual scroll), 上架狀態 (`p-select`), 允許重聽 (tri-state), 上架日期 起／迄 (`p-datepicker` ×2), 下架日期 起／迄 (`p-datepicker` ×2).
- On init: `forkJoin` the three lookups, then apply incoming `partnerPkid` / `courseGroupPkid` / `publishStatusPkid` query params (override + persist) or restore saved filters, then fetch.
- Default sort `displayOrder ASC`; page size 20; `[tableStyle]` min-width ~110rem with horizontal scroll.

### Delete Confirmation Message

```
確定要刪除主代碼 <b>${item.pkid}</b>「${item.title}」？
```
On 409: 此課程已被常見問題、相關連結或熱門課程使用，無法刪除。

### Session Storage Keys

| Key | Contents |
|-----|----------|
| `course-list-filters` | `CourseQuery` (dates as ISO strings) |
| `course-list-sort` | `{ field, order }` |
| `course-list-page` | `{ first, rows }` |

### Detail page

Cards: 課程資料 (codes, title, partner/group/status as router links, schedule, hour/price/credit, canRepeat), 課程說明 (the eight long-text fields, `white-space: pre-wrap`, 「—」 when null), 對應認證 (chips), 職務類別 (chips). `forkJoin` course + certification + job-category lookups.

### Form page

| Field | Control | Validation |
|-------|---------|-----------|
| 主代碼 | read-only, edit only | — |
| 課程名稱 | `input pInputText` | required, max 200 |
| 原廠課程名稱 | `input pInputText` | max 300 |
| 簡介代碼 / 科目代碼 | `input pInputText` | required, max 50 |
| 網址別名 | `input pInputText` | required, max 100 |
| 顯示順序 | `p-inputnumber` | required, default 0 |
| 原廠 | `p-select` (filter) | required |
| 課程群組 | `p-select` (filter, virtual scroll, showClear) | optional |
| 上架狀態 | `p-select` | required |
| 上架日期 / 下架日期 | `p-datepicker` (yy/mm/dd) | required; 下架 ≥ 上架 (group validator) |
| 時數 | `p-inputnumber` | required, ≥ 0, default 0 |
| 定價 | `p-inputnumber` 0 decimals | required, ≥ 0, default 0 |
| 點數 | `p-inputnumber` 1 decimal | required, ≥ 0, default 0 |
| 允許重聽 | `p-checkbox` | default false |
| 教材 / 適合對象 | `textarea pTextarea` | max 500 |
| 課程目標 / 先備知識 / 備註 / 其他資訊 | `textarea pTextarea` | max 4000 |
| 課程大綱 / 對應認證／考試 | `textarea pTextarea` (taller) | — |
| 對應認證 | `p-multiselect` chips | — |
| 職務類別 | `p-multiselect` chips | — |

Special behaviour: in **add** mode, when 上架日期 changes and 下架日期 has not been touched by the user, 下架日期 is set to 上架日期 + 10 years (`{ emitEvent: false }`), matching existing data.

Sub-panels: N/A (FAQ / related links / hot courses are future features).

### Sidebar

Existing group `課程管理 Course`, append `{ label: '課程 Course', icon: 'pi-book', route: '/courses' }`.

### Parent features (modify)

Partner, CourseGroup and PublishStatus list 操作 columns and detail toolbars gain 查看課程 (`pi pi-book`) → `/courses?partnerPkid=` / `?courseGroupPkid=` / `?publishStatusPkid=`.

---

## Tests

### Backend (`src\CMS.API.Tests`)

`FakeCourseRepository` (3 seeded courses across 2 partners, with nav objects and n-n ids) replaces `ICourseRepository`.

- GetAll ordered by DisplayOrder then pkid, nav objects populated
- Query: keyword (title / courseId), partnerPkid, courseGroupPkid, publishStatusPkid, canRepeat, scheduleOn range, scheduleOff range, empty → all
- GetById: found with `certificationPkids`/`jobCategoryPkids`; missing → 404; non-numeric → 404
- Create: 201 + Location + n-n persisted; trims and nulls blank optionals; missing Title → 400; CourseId > 50 → 400; PartnerPkid 0 → 400; ScheduleOff < ScheduleOn → 400
- Update: existing changes fields and n-n; missing → 404; bad date range → 400
- Delete: 204 then 404; missing → 404
- Lookups: `/api/lookups/certifications`, `/api/lookups/jobcategories`

### Frontend (`src\CMS.NG`)

- `date.util.spec.ts` — `toIso` uses local components; `parseIso` round-trips
- `course.service.spec.ts` — every method URL/verb
- `course-list.spec.ts` — renders rows with nav labels, lookups loaded, incoming `partnerPkid` param overrides saved filters, filter persistence incl. date → ISO, sort/page, navigation, delete confirm + 409
- `course-detail.spec.ts` — renders fields, chips resolved from lookups, null group shows 「—」, edit/back
- `course-form.spec.ts` — add: defaults, required validation, date-range validator, ScheduleOff auto-default, create payload (ISO dates, nulls, n-n); edit: loads record, pkid read-only, update payload, cancel
- Parent list/detail specs — 查看課程 navigates with the right query param
- `app.spec.ts` — sidebar entry

---

## Files to Create / Modify

| Area | File | Action |
|------|------|--------|
| Backend | `Models/Course.cs`, `CourseRequest.cs`, `CourseQuery.cs`, `CertificationLookup.cs`, `JobCategoryLookup.cs` | create |
| Backend | `Repositories/ICourseRepository.cs`, `CourseRepository.cs` | create |
| Backend | `Controllers/CoursesController.cs` | create |
| Backend | `Controllers/LookupsController.cs` | modify — certifications, jobcategories |
| Backend | `Program.cs` | modify — DI |
| Tests | `CMS.API.Tests/FakeCourseRepository.cs`, `CoursesApiTests.cs` | create |
| Frontend | `core/utils/date.util.ts` + spec | create |
| Frontend | `features/courses/course.model.ts`, `course.service.ts` + spec | create |
| Frontend | `features/courses/course-list/`, `course-detail/`, `course-form/` (ts, html, spec) | create |
| Frontend | `app.routes.ts`, `app.ts`, `app.spec.ts` | modify |
| Frontend | `partners/partner-list`, `partner-detail`; `course-groups/course-group-list`, `course-group-detail`; `publish-statuses/publish-status-list`, `publish-status-detail` (ts, html, spec) | modify — 查看課程 button |
| Docs | `CLAUDE.md` | modify — Features list |
