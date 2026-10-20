# Build Spec for ModelPrice
- database schema: `.\database\admin.sql`
- parent design: GitHub issue #2 (Agent token consumption report), ticket #4

---

## Summary

`ModelPrice` is the price list used to cost Claude Code token usage. Each row holds the five USD prices per million tokens for one Claude model from one effective date onward. Usage on date D is priced at the row for that model with the latest `EffectiveDate <= D` (cost calculation and recompute are ticket #5, not this feature).

| Item | Detail |
|------|--------|
| Primary Key | Composite (`Model nvarchar(100)`, `EffectiveDate date`), no `pkid`, user-supplied. `POST` checks for duplicates → 409; both key fields are locked in edit mode. |
| Foreign Keys | None (`TokenUsage.Model` matches by value, not by FK) |
| Required Fields | all columns (NOT NULL) |
| N-N Relationships | N/A |
| Primary-Foreign Links | N/A |
| Query Filters | keyword (Model), EffectiveDate from/to (`DateOnly`, inclusive) |
| Default Sort | `Model ASC, EffectiveDate DESC` |

---

## Localization

### Chinese Table Name

- ModelPrice: 模型價格
- Description: Claude 模型每百萬 token 的美元單價（依生效日）

### Chinese Column Names

- Model: 模型
- EffectiveDate: 生效日
- InputPrice: 輸入
- CacheWrite5mPrice: 快取寫入 5 分鐘
- CacheWrite1hPrice: 快取寫入 1 小時
- CacheReadPrice: 快取讀取
- OutputPrice: 輸出

All prices are USD per million tokens (`US$ / MTok`).

---

## Schema

```sql
CREATE TABLE [dbo].[ModelPrice](
	[Model] [nvarchar](100) NOT NULL,
	[EffectiveDate] [date] NOT NULL,
	[InputPrice] [decimal](18, 6) NOT NULL,
	[CacheWrite5mPrice] [decimal](18, 6) NOT NULL,
	[CacheWrite1hPrice] [decimal](18, 6) NOT NULL,
	[CacheReadPrice] [decimal](18, 6) NOT NULL,
	[OutputPrice] [decimal](18, 6) NOT NULL,
 CONSTRAINT [PK_ModelPrice] PRIMARY KEY CLUSTERED ([Model] ASC, [EffectiveDate] ASC)
)
```

`decimal(18,6)` holds sub-cent rates such as Haiku 5.5's $0.01 cache read and $0.125 cache write exactly.

### Seed rows

Official Anthropic first-party pricing (https://platform.claude.com/docs/en/about-claude/pricing), read 2026-10-20. `Model` is the API model ID, which is what Claude Code transcripts record. `EffectiveDate` is `2026-01-01` so all usage collected by the hook is priced.

| Model | Input | 5m write | 1h write | Cache read | Output |
|-------|------:|------:|------:|------:|------:|
| claude-fable-5-1 | 10 | 12.50 | 20 | 0.25 | 50 |
| claude-fable-5 | 10 | 12.50 | 20 | 1 | 50 |
| claude-opus-5-5 | 4 | 5 | 8 | 0.20 | 20 |
| claude-opus-5 | 5 | 6.25 | 10 | 0.50 | 25 |
| claude-sonnet-5-5 | 2 | 2.50 | 4 | 0.10 | 10 |
| claude-sonnet-5 | 2 | 2.50 | 4 | 0.20 | 10 |
| claude-haiku-5-5 | 0.10 | 0.125 | 0.20 | 0.01 | 0.50 |

Haiku 5.5 is priced higher for prompts over 100,000 tokens ($0.50 / $0.625 / $1 / $0.05 / $2.50). The table has one price per model and date, so only the ≤100K tier is seeded.

---

## Query Filters

- **keyword**: string — LIKE on `Model`
- **effectiveDateFrom / effectiveDateTo**: `DateOnly?` — inclusive range on `EffectiveDate`

---

## Lookup Endpoints Required

None. `ModelPrice` is not an FK target.

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/modelprices` | List all, `ORDER BY Model, EffectiveDate DESC` |
| `POST` | `/api/modelprices/query` | Filtered query (body: `ModelPriceQuery`) |
| `GET` | `/api/modelprices/{model}/{effectiveDate}` | `effectiveDate` is `yyyy-MM-dd` (`DateOnly`); 404 if missing |
| `POST` | `/api/modelprices` | Create; **409** if (Model, EffectiveDate) exists; 201 + Location |
| `PUT` | `/api/modelprices` | Update prices (key from body); 404 if missing |
| `DELETE` | `/api/modelprices/{model}/{effectiveDate}` | 204; 404 if missing |

Validation (400): `Model` required, max 100 (trimmed); every price `>= 0`.

---

## Backend Notes

### Models

```csharp
public class ModelPrice
{
    public string Model { get; set; } = "";
    public DateOnly EffectiveDate { get; set; }
    public decimal InputPrice { get; set; }
    public decimal CacheWrite5mPrice { get; set; }
    public decimal CacheWrite1hPrice { get; set; }
    public decimal CacheReadPrice { get; set; }
    public decimal OutputPrice { get; set; }
}

public class ModelPriceRequest   // same fields; [Required, StringLength(100)] Model; [Range(0, 999999)] on each price
public class ModelPriceQuery { string? Keyword; DateOnly? EffectiveDateFrom; DateOnly? EffectiveDateTo; }
```

### SQL

```sql
SELECT m.Model, m.EffectiveDate, m.InputPrice, m.CacheWrite5mPrice, m.CacheWrite1hPrice, m.CacheReadPrice, m.OutputPrice
FROM ModelPrice m
-- ORDER BY m.Model, m.EffectiveDate DESC
-- by key: WHERE m.Model = @Model AND m.EffectiveDate = @EffectiveDate

INSERT INTO ModelPrice (Model, EffectiveDate, InputPrice, CacheWrite5mPrice, CacheWrite1hPrice, CacheReadPrice, OutputPrice)
VALUES (@Model, @EffectiveDate, @InputPrice, @CacheWrite5mPrice, @CacheWrite1hPrice, @CacheReadPrice, @OutputPrice);

UPDATE ModelPrice SET InputPrice = @InputPrice, ... WHERE Model = @Model AND EffectiveDate = @EffectiveDate;  -- 0 rows → 404
DELETE FROM ModelPrice WHERE Model = @Model AND EffectiveDate = @EffectiveDate;                             -- 0 rows → 404
```

No JOINs, no `nchar`. SQL error 2627 (PK violation from a concurrent insert) is also mapped to 409.

RowAudit: not implemented (no audit writer in the project yet, same as the other features).

---

## Frontend Notes

### Routes

| Route | Component |
|-------|-----------|
| `/model-prices` | `ModelPriceList` |
| `/model-prices/new` | `ModelPriceForm` (add) — **must precede the key routes** |
| `/model-prices/:model/:date/edit` | `ModelPriceForm` (edit) |
| `/model-prices/:model/:date` | `ModelPriceDetail` |

Service: `getAll`, `query`, `get(model, effectiveDate)`, `create`, `update`, `delete(model, effectiveDate)`; `model` goes through `encodeURIComponent`.

### List page

- Title: 模型價格 ModelPrice <small>US$ / 百萬 tokens</small>
- Columns (sortable): 模型 · 生效日 · 輸入 · 快取寫入 5m · 快取寫入 1h · 快取讀取 · 輸出 · 操作
- Prices right-aligned, shown with `number:'1.2-6'`.
- Filter drawer: 關鍵字 (Model), 生效日 起 / 迄 (`p-datepicker`, `appendTo="body"`).
- Default sort `model ASC` (the API already returns `EffectiveDate DESC` within a model); page size 20.
- Delete confirm: `確定要刪除模型 <b>${model}</b> 生效日 <b>${effectiveDate}</b> 的價格？`

Session storage: `modelprice-list-filters`, `modelprice-list-sort`, `modelprice-list-page`.

### Detail page

`dl` card 模型價格資料 with all seven fields. Toolbar: 返回, 編輯.

### Form page

| Field | Control | Validation |
|-------|---------|-----------|
| 模型 | `input pInputText` | required, maxLength 100; disabled in edit mode |
| 生效日 | `p-datepicker` (`yyyy-mm-dd`) | required; disabled in edit mode |
| five prices | `p-inputnumber` (min 0, 0–6 decimals) | required, ≥ 0 |

Key fields read with `getRawValue()`. On 409 from create: 模型「{model}」於 {date} 的價格已存在.

### Sidebar

Existing group **系統管理 Admin** → `{ label: '模型價格 ModelPrice', icon: 'pi-dollar', route: '/model-prices' }` after 發布狀態 PublishStatus.

---

## Tests

### Backend

`ModelPricesApiTests` with `FakeModelPriceRepository`: list order, query by keyword / date range, get by composite key (found / 404 / bad date 404), create (201 + Location, duplicate 409, blank model 400, negative price 400), update (200 persisted / 404), delete (204 then 404 / 404).

### Frontend

Service spec (URLs incl. encoded model), list / detail / form component specs, `app.spec.ts` sidebar entry.

---

## Files to Create / Modify

| Area | File | Action |
|------|------|--------|
| DB | `database/admin.sql` | modify — table + seed |
| Backend | `src/CMS.API/Models/ModelPrice.cs`, `ModelPriceRequest.cs`, `ModelPriceQuery.cs` | create |
| Backend | `src/CMS.API/Repositories/IModelPriceRepository.cs`, `ModelPriceRepository.cs` | create |
| Backend | `src/CMS.API/Controllers/ModelPricesController.cs` | create |
| Backend | `src/CMS.API/Program.cs` | modify — DI |
| Tests | `src/CMS.API.Tests/FakeModelPriceRepository.cs`, `ModelPricesApiTests.cs` | create |
| Frontend | `src/CMS.NG/src/app/features/model-prices/**` | create |
| Frontend | `app.routes.ts`, `app.ts`, `app.spec.ts` | modify |
| Docs | `docs/features.md` | modify |
