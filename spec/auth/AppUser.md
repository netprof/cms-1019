# Build Spec for AppUser
- database schema: `.\database\auth.sql`

---

## Summary

`AppUser` is the login-account table of the CMS. Each account has a string `UserId` (the primary key — the `pkid` identity column is **not** the key, same quirk as `AppRole`), a display `UserName`, an `IsActive` flag, a `PasswordHash` and the time the password was last set. Users are linked to roles through the `AppUserRole` junction (n-n with `AppRole`).

`PasswordHash` is **backend-only**: it never leaves the API and is never accepted from the client. On create the API sets it to the SHA-256 of the default password stored in `SysConfig` (`configKey = 'appConfig'`, JSON property `defaultPassword`); on update it is left untouched; a separate `POST /api/appusers/{id}/reset-password` endpoint resets it to that default again.

| Item | Detail |
|------|--------|
| Primary Key | `UserId` nvarchar(200) (string PK; `pkid` int IDENTITY is a non-key surrogate, read-only) |
| Foreign Keys | None |
| Required Fields | `UserId`, `UserName`, `IsActive` (`PasswordHash` is NOT NULL but server-generated) |
| N-N Relationships | `AppUserRole` (`UserId` → AppUser, `RoleId` → AppRole) |
| Primary-Foreign Links | `AppUserRole.UserId` only (junction, handled as n-n) — no child list pages |
| Query Filters | keyword (UserId, UserName); IsActive tri-state; RoleId dropdown; PasswordUpdatedTime date range |
| Default Sort | `UserId ASC` |

---

## Localization

### Chinese Table Name

- AppUser: 使用者
- Description: 系統登入帳號主檔，透過 AppUserRole 指派角色

### Chinese Column Names

- pkid: 主代碼
- UserId: 帳號
- UserName: 使用者名稱
- IsActive: 啟用
- PasswordHash: 密碼雜湊（後端專用，不顯示）
- PasswordUpdatedTime: 密碼更新時間
- RoleIds (n-n): 角色

---

## Required Fields

Required (NOT NULL):
- `UserId` nvarchar(200) — string PK; trimmed on save; immutable in edit mode
- `UserName` nvarchar(200)
- `IsActive` bit — default constraint `1`; form defaults to checked
- `PasswordHash` nvarchar(800) — **server-generated**, excluded from request DTO and all Angular models

Optional (nullable):
- `PasswordUpdatedTime` datetime — **read-only** in the UI; set by the server on create and on reset-password

---

## Foreign Keys

**N/A** — `AppUser` has no foreign key columns.

---

## Foreign-Primary Links

**N/A**

---

## Primary-Foreign Links

The only table referencing `AppUser.UserId` is the `AppUserRole` junction, which is handled as the n-n relationship below. No child list page, no link buttons.

Because `FK_AppUserRole_AppUser` has no cascade, `DeleteAsync` removes the junction rows first, then the user, in one transaction (same as `AppRoleRepository.DeleteAsync`). SQL 547 is still mapped to 409 as a backstop.

---

## N-N Relationships

### AppUserRole (AppUser ↔ AppRole)

- Junction: `AppUserRole` (`pkid` int IDENTITY, `UserId` → `AppUser.UserId`, `RoleId` → `AppRole.RoleId`; PK is the composite `(UserId, RoleId)`)
- Related entity: `AppRole`; lookup endpoint **new** `GET /api/lookups/approles` → `{ roleId, roleName }[]` ordered by `RoleId`
- **List view**: `RoleCount` (subquery count) column 角色數
- **Detail view**: card 角色（N）with `p-tag` chips labelled `RoleName (RoleId)`, falling back to the raw id if the role is not in the lookup
- **Form (edit + new)**: `p-multiselect` bound to `roleIds`, options `{ roleId, label: 'RoleName (RoleId)' }`, `display="chip"`, `[maxSelectedLabels]="9999"`, `appendTo="body"`, `[filter]` when 10+ options
- Request field: `RoleIds: List<string>`
- Sync on save (inside the create/update transaction):
  1. `DELETE FROM AppUserRole WHERE UserId = @UserId`
  2. `INSERT INTO AppUserRole (UserId, RoleId) VALUES (@UserId, @RoleId)` per distinct id

This is the mirror of `AppRole.UserIds`; editing from either side writes the same junction.

---

## Query Filters

- **keyword**: LIKE on `UserId`, `UserName`
- **IsActive** (bool, tri-state): `null` = all, `true` = 啟用, `false` = 停用 — `p-select` with 全部 / 啟用 / 停用
- **RoleId** (n-n filter, string): users that have this role — `EXISTS (SELECT 1 FROM AppUserRole ur WHERE ur.UserId = u.UserId AND ur.RoleId = @RoleId)`; `p-select` from `/api/lookups/approles`, `appendTo="body"`
- **PasswordUpdatedTime** date range: `PasswordUpdatedFrom` / `PasswordUpdatedTo` (`DateOnly?`, inclusive; `To` compares `< @To + 1 day`). Two `p-datepicker`s; serialised with `toIso()` from `core/utils/date.util.ts`.

---

## Lookup Endpoints Required

| Route | Status | Returns |
|-------|--------|---------|
| `GET /api/lookups/appusers` | Exists (`IAppRoleRepository.GetUserLookupsAsync`) | `{ userId, userName }[]` — unchanged |
| `GET /api/lookups/approles` | **New** (`IAppUserRepository.GetRoleLookupsAsync`) | `{ roleId, roleName }[]` ordered by `RoleId` |

---

## API Endpoints

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/api/appusers` | List all, `ORDER BY UserId` |
| `POST` | `/api/appusers/query` | Filtered query (body: `AppUserQuery`) |
| `GET` | `/api/appusers/{id}` | Get by UserId (string, no `:int`); includes `RoleIds`; 404 if missing |
| `POST` | `/api/appusers` | Create; trims `UserId`; **409** if `UserId` exists; sets `PasswordHash` = SHA-256(default password) and `PasswordUpdatedTime` = now; 201 + Location |
| `PUT` | `/api/appusers` | Update (`UserId` from body); updates `UserName`, `IsActive`, roles only — **never touches `PasswordHash`**; 404 if missing |
| `DELETE` | `/api/appusers/{id}` | Deletes junction rows then the user in one transaction; 404 if missing; 547 → 409 backstop |
| `POST` | `/api/appusers/{id}/reset-password` | Resets `PasswordHash` to SHA-256(default password), sets `PasswordUpdatedTime` = now; returns the updated `AppUser`; 404 if missing; empty body |
| `GET` | `/api/lookups/approles` | Slim role lookup |

Auth exceptions: none (the project has no auth middleware yet).

### Default password resolution

`SysConfig` row `configKey = 'appConfig'` holds a JSON object:

```json
{ "defaultPassword": "…", "symmetricSecurityKey": "…", "enforcePasswordPolicy": true }
```

`IAppUserRepository.GetDefaultPasswordAsync()` reads `configValue`, parses it with `System.Text.Json`, and returns the `defaultPassword` string. If the row or the property is missing/blank it throws `InvalidOperationException("SysConfig 'appConfig' has no defaultPassword.")` → 500 (misconfiguration, not a client error).

Hashing: `Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(password)))` — lowercase hex, 64 chars. This matches the format of the existing seeded admin row (verified against the real DB), so the login code that already exists elsewhere keeps working. Implemented as a static helper `PasswordHasher.Sha256Hex(string)` in `Services/PasswordHasher.cs` so the repository and tests share it.

---

## Backend Notes

### Models

```csharp
public class AppUser
{
    public int Pkid { get; set; }
    public string UserId { get; set; } = "";
    public string UserName { get; set; } = "";
    public bool IsActive { get; set; }
    public DateTime? PasswordUpdatedTime { get; set; }

    /// <summary>Number of roles assigned (subquery count).</summary>
    public int RoleCount { get; set; }

    /// <summary>Assigned role ids; populated for single-record reads only.</summary>
    public List<string> RoleIds { get; set; } = new();
    // NO PasswordHash property — never serialised to the client.
}

public class AppUserRequest
{
    [Required, StringLength(200)]
    public string UserId { get; set; } = "";

    [Required, StringLength(200)]
    public string UserName { get; set; } = "";

    public bool IsActive { get; set; } = true;

    public List<string> RoleIds { get; set; } = new();
    // NO PasswordHash, NO PasswordUpdatedTime — server-controlled.
}

public class AppUserQuery
{
    /// <summary>Matches UserId or UserName (contains).</summary>
    public string? Keyword { get; set; }
    public bool? IsActive { get; set; }
    /// <summary>Only users assigned this role.</summary>
    public string? RoleId { get; set; }
    public DateOnly? PasswordUpdatedFrom { get; set; }
    public DateOnly? PasswordUpdatedTo { get; set; }
}

public class AppRoleLookup
{
    public string RoleId { get; set; } = "";
    public string RoleName { get; set; } = "";
}
```

### Repository interface

```csharp
Task<IEnumerable<AppUser>> GetAllAsync();
Task<IEnumerable<AppUser>> QueryAsync(AppUserQuery query);
Task<AppUser?> GetByIdAsync(string userId);
Task<bool> ExistsAsync(string userId);
Task<AppUser> CreateAsync(AppUserRequest request, string passwordHash);
Task<AppUser?> UpdateAsync(AppUserRequest request);
Task<AppUser?> ResetPasswordAsync(string userId, string passwordHash);
Task<bool> DeleteAsync(string userId);
Task<string> GetDefaultPasswordAsync();
Task<IEnumerable<AppRoleLookup>> GetRoleLookupsAsync();
```

The controller computes the hash (`PasswordHasher.Sha256Hex(await repository.GetDefaultPasswordAsync())`) and passes it in, so the fake repository in tests can assert the exact hash it received.

### SQL — SELECT

```sql
SELECT u.pkid AS Pkid,
       RTRIM(u.UserId) AS UserId,
       u.UserName,
       u.IsActive,
       u.PasswordUpdatedTime,
       (SELECT COUNT(*) FROM AppUserRole ur WHERE ur.UserId = u.UserId) AS RoleCount
FROM AppUser u
-- GetAll:  ORDER BY u.UserId
-- Query:   WHERE (u.UserId LIKE @Keyword OR u.UserName LIKE @Keyword)
--            AND u.IsActive = @IsActive
--            AND EXISTS (SELECT 1 FROM AppUserRole ur WHERE ur.UserId = u.UserId AND ur.RoleId = @RoleId)
--            AND u.PasswordUpdatedTime >= @From
--            AND u.PasswordUpdatedTime < @ToExclusive   -- @To + 1 day
--          ORDER BY u.UserId
-- GetById: WHERE u.UserId = @userId
--   then:  SELECT RTRIM(RoleId) FROM AppUserRole WHERE UserId = @userId ORDER BY RoleId
```

`PasswordHash` is never selected.

### SQL — INSERT

```sql
INSERT INTO AppUser (UserId, UserName, IsActive, PasswordHash, PasswordUpdatedTime)
VALUES (@UserId, @UserName, @IsActive, @PasswordHash, @PasswordUpdatedTime);
-- @PasswordUpdatedTime = DateTime.UtcNow; no SCOPE_IDENTITY needed (string PK)
-- then n-n sync, all in one transaction
```

### SQL — UPDATE

```sql
UPDATE AppUser
SET UserName = @UserName, IsActive = @IsActive
WHERE UserId = @UserId;
-- PasswordHash / PasswordUpdatedTime deliberately NOT in the SET list
-- 0 rows → 404; then n-n sync in the same transaction
```

### SQL — Reset password

```sql
UPDATE AppUser
SET PasswordHash = @PasswordHash, PasswordUpdatedTime = @PasswordUpdatedTime
WHERE UserId = @UserId;
-- 0 rows → 404
```

### SQL — DELETE

```sql
DELETE FROM AppUserRole WHERE UserId = @userId;
DELETE FROM AppUser WHERE UserId = @userId;
-- one transaction; 0 rows on the second → 404
```

### SQL — Default password / Lookup

```sql
SELECT configValue FROM SysConfig WHERE configKey = 'appConfig'
SELECT RTRIM(RoleId) AS RoleId, RoleName FROM AppRole ORDER BY RoleId
```

### N-N Sync Pattern

```sql
DELETE FROM AppUserRole WHERE UserId = @UserId;
INSERT INTO AppUserRole (UserId, RoleId) VALUES (@UserId, @RoleId);  -- per distinct RoleId
```

### Special Column Notes

- `UserId` is the string PK → controller route `{id}` with no `:int`; Angular service uses `encodeURIComponent`. `pkid` is shown read-only (edit/detail) and never used for routing.
- `UserId` and `RoleId` are `nvarchar`, but the existing `AppRoleRepository` wraps them in `RTRIM()`; keep the same for consistency.
- `PasswordUpdatedTime` is `datetime` → `DateTime?`; written as `DateTime.UtcNow`. Dapper returns it with `Kind = Unspecified`, so the Angular templates append `'Z'` before the `date` pipe (`{{ u.passwordUpdatedTime + 'Z' | date:'yyyy-MM-dd HH:mm' }}`).
- `IsActive` has DB default `1`; the request DTO defaults to `true` too.
- No `nchar`, no computed columns, no `DateOnly` columns in the table itself (the query DTO uses `DateOnly?` for the date-range filter; handlers already registered).
- **RowAudit**: not implemented in this project (no audit writer exists); not added here.

---

## Frontend Notes

### Routes

| Route | Component |
|-------|-----------|
| `/app-users` | `AppUserList` |
| `/app-users/new` | `AppUserForm` (add) — **must precede `:id`** |
| `/app-users/:id/edit` | `AppUserForm` (edit) |
| `/app-users/:id` | `AppUserDetail` |

### Angular model (`features/app-users/app-user.model.ts`)

```ts
export interface AppUser {
  pkid: number;
  userId: string;
  userName: string;
  isActive: boolean;
  passwordUpdatedTime: string | null;
  roleCount: number;
  roleIds: string[];
}
export interface AppUserRequest {
  userId: string;
  userName: string;
  isActive: boolean;
  roleIds: string[];
}
export interface AppUserQuery {
  keyword?: string | null;
  isActive?: boolean | null;
  roleId?: string | null;
  passwordUpdatedFrom?: string | null;
  passwordUpdatedTo?: string | null;
}
export interface AppRoleLookup { roleId: string; roleName: string; }
```

No `passwordHash` anywhere in the frontend.

Service (`app-user.service.ts`): `getAll`, `query`, `get(id)`, `create`, `update`, `delete(id)`, `resetPassword(id)` (POST `/appusers/{id}/reset-password`, empty body), `getRoleLookups` (GET `/lookups/approles`). String PK → `encodeURIComponent` in `get`, `delete`, `resetPassword`.

### List page

- Title: 使用者 AppUser <small>系統登入帳號</small>
- Columns (all sortable): 主代碼 · 帳號 · 使用者名稱 · 啟用 (`p-tag` 啟用/停用, success/secondary) · 密碼更新時間 (`+ 'Z' | date:'yyyy-MM-dd HH:mm'`, 「—」 when null) · 角色數 · 操作 (檢視 / 編輯 / 刪除)
- Filter drawer (`p-drawer`, right): 關鍵字 (`input pInputText`) · 啟用 (`p-select` 全部/啟用/停用, `appendTo="body"`) · 角色 (`p-select` from role lookup, `appendTo="body"`, `[showClear]`) · 密碼更新時間 起/迄 (two `p-datepicker`, `dateFormat="yy-mm-dd"`, `appendTo="body"`)
- Default sort `userId ASC`; page size 20.
- `forkJoin` on init loads the role lookup, then fetches with the restored filters.

### Delete Confirmation Message

```
確定要刪除帳號「${item.userId}」（${item.userName}）？
```

(String PK — no pkid in the message, mirrors AppRole.) On 409: 此使用者仍被其他資料使用，無法刪除.

### Session Storage Keys

| Key | Contents |
|-----|----------|
| `appuser-list-filters` | Last query filter values |
| `appuser-list-sort` | `{ field, order }` |
| `appuser-list-page` | `{ first, rows }` |

No incoming cross-entity query params.

### Detail page

- Toolbar: 返回 · 重設密碼 (`pi pi-key`, severity warn, outlined; `p-confirmdialog` 「確定要將帳號「…」的密碼重設為系統預設密碼？」; on success toast 密碼已重設 and refresh the record so 密碼更新時間 updates) · 編輯
- Card 使用者資料: 主代碼 / 帳號 / 使用者名稱 / 啟用 (`p-tag`) / 密碼更新時間 (`+ 'Z'` date pipe, 「—」 when null)
- Card 角色（N）: `p-tag` chips `RoleName (RoleId)` resolved via `forkJoin({ user, roles })`, raw id fallback

### Form page

| Field | Control | Validation |
|-------|---------|-----------|
| 主代碼 | read-only text, edit mode only | — |
| 帳號 | `input pInputText` | required, maxLength 200; **disabled in edit mode** (read via `getRawValue()`); trimmed on save |
| 使用者名稱 | `input pInputText` | required, maxLength 200 |
| 啟用 | `p-togglewitch` | default `true` in add mode |
| 角色 | `p-multiselect` (card 角色) | optional; `display="chip"`, `[maxSelectedLabels]="9999"`, `appendTo="body"`, `[filter]="roleOptions.length >= 10"` |

No password field. Add mode shows an info `p-message` (severity info): 新增後密碼為系統預設密碼，可於檢視頁重設. `forkJoin({ roles, user })` on init (user = `of(null)` in add mode). Save: 409 → toast 帳號「…」已存在; otherwise navigate back to `/app-users`.

### Sidebar

Existing group `系統管理 Admin` — insert **before** 角色 AppRole:

```ts
{ label: '使用者 AppUser', icon: 'pi-user', route: '/app-users' },
```

`app.spec.ts` test "should show the AppRole entry" reads the first `a.nav-item`; update it to find the AppRole link by text so the new first entry does not break it.

---

## Tests

### Backend (`src\CMS.API.Tests`)

Same style as `AppRolesApiTests`: real HTTP pipeline via `WebApplicationFactory<Program>` with `FakeAppUserRepository` (in-memory, seeded with `helen` / `jenny`, default password `Secret#1`, roles `Admin` / `User`) replacing `IAppUserRepository`. The fake records the hash passed to `CreateAsync` / `ResetPasswordAsync` so tests can assert it.

- `GetAll` returns seeded users with `RoleCount`
- `Query` by keyword; by `IsActive`; by `RoleId`; by date range; empty filter returns all
- `GetById` found → 200 with `RoleIds`; missing → 404
- `Create` valid → 201 + Location; stored hash == `PasswordHasher.Sha256Hex("Secret#1")`; `PasswordUpdatedTime` set; roles persisted; duplicate → 409; blank `UserName` → 400; response JSON contains no `passwordHash` property
- `Update` existing → fields and roles change, hash unchanged; missing → 404; a `passwordHash` property in the body is ignored
- `ResetPassword` existing → 200, hash == default hash, `PasswordUpdatedTime` refreshed; missing → 404
- `Delete` existing → 204 then 404; missing → 404
- `Lookups` `/api/lookups/approles` returns `{roleId, roleName}` ordered by RoleId
- `PasswordHasherTests`: `Sha256Hex("abc")` == the FIPS 180-4 test vector; lowercase 64-char hex; UTF-8 bytes

### Frontend (`src\CMS.NG`)

- `app-user.service.spec.ts` — every method hits the right URL/verb; `get` / `delete` / `resetPassword` URL-encode the id
- `app-user-list.spec.ts` — renders rows, 啟用 tag, filters persist to session storage, sort/page persist, restore, navigation, delete after confirm, 409 message
- `app-user-detail.spec.ts` — loads by route id, resolves role names, reset-password after confirm refreshes the record, edit/back navigation
- `app-user-form.spec.ts` — add: defaults (`isActive` true), required validation, create payload has no password fields; edit: loads record, `userId` disabled, update payload from `getRawValue()`, 409 handling, cancel
- `app.spec.ts` — sidebar shows 使用者 AppUser under 系統管理 Admin

---

## Files to Create / Modify

| Area | File | Action |
|------|------|--------|
| Backend | `src/CMS.API/Models/AppUser.cs` | create |
| Backend | `src/CMS.API/Models/AppUserRequest.cs` | create |
| Backend | `src/CMS.API/Models/AppUserQuery.cs` | create |
| Backend | `src/CMS.API/Models/AppRoleLookup.cs` | create |
| Backend | `src/CMS.API/Services/PasswordHasher.cs` | create |
| Backend | `src/CMS.API/Repositories/IAppUserRepository.cs` | create |
| Backend | `src/CMS.API/Repositories/AppUserRepository.cs` | create |
| Backend | `src/CMS.API/Controllers/AppUsersController.cs` | create |
| Backend | `src/CMS.API/Controllers/LookupsController.cs` | modify — add `approles` |
| Backend | `src/CMS.API/Program.cs` | modify — DI registration |
| Tests | `src/CMS.API.Tests/FakeAppUserRepository.cs` | create |
| Tests | `src/CMS.API.Tests/AppUsersApiTests.cs` | create |
| Tests | `src/CMS.API.Tests/PasswordHasherTests.cs` | create |
| Frontend | `src/CMS.NG/src/app/features/app-users/app-user.model.ts` | create |
| Frontend | `.../app-users/app-user.service.ts` + `.spec.ts` | create |
| Frontend | `.../app-users/app-user-list/` (ts, html, spec) | create |
| Frontend | `.../app-users/app-user-detail/` (ts, html, spec) | create |
| Frontend | `.../app-users/app-user-form/` (ts, html, spec) | create |
| Frontend | `src/CMS.NG/src/app/app.routes.ts` | modify — lazy routes |
| Frontend | `src/CMS.NG/src/app/app.ts` | modify — sidebar entry |
| Frontend | `src/CMS.NG/src/app/app.spec.ts` | modify — sidebar test |
| Docs | `CLAUDE.md` | modify — Features list |
