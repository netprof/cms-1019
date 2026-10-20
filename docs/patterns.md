# Design patterns and precedents

Recipes for cases that come up when adding a feature. Each names the feature that already does it, so copy from there.

## Deleting a row that other tables reference

- Map SQL error 547 (FK violation) to HTTP 409 in the controller. Precedent: `PublishStatus`, `Partner`, `Course`.
- If a child FK is `ON DELETE CASCADE` (check `database\*.sql`), SQL will not raise 547 — it silently deletes the children. Add an `IsInUseAsync(pkid)` repository method (`EXISTS` over every referencing table) and return 409 **before** issuing the delete. Keep the 547 mapping as a backstop. Precedent: `CourseGroup`.

## Keys that are not `int IDENTITY`

- **String PK** (`AppRole.RoleId`, `AppUser.UserId`): the `pkid` identity column is a read-only surrogate, not the key. Controller route is `{id}` with no `:int`; the Angular service calls `encodeURIComponent(id)`.
- **User-supplied numeric PK** (`PublishStatus.pkid tinyint`): `POST` returns 409 on a duplicate; the key field is editable on add and locked on edit. Edit mode disables the control, so read the form with `getRawValue()`.
- **Composite user-supplied key** (`ModelPrice`: `Model` + `EffectiveDate`): routes carry every key part (`/api/modelprices/{model}/{yyyy-MM-dd}`, Angular `:model/:date`), `POST` returns 409 on a duplicate, and all key fields are locked on edit.
- **`smallint IDENTITY`** (`Partner`, `CourseGroup`): C# `short`; the key is displayed read-only in edit mode and is not a form control.

## Server-controlled columns

Example: `AppUser.PasswordHash`.

- Leave the column out of the response model, the request DTO and every Angular model; never SELECT it.
- Pass the computed value into the repository as a separate parameter (`CreateAsync(request, passwordHash)`) so the fake repository in tests can assert exactly what was stored.
- Give the column its own endpoint (`POST /{id}/reset-password`) instead of a request field. `PUT` never touches it.
- `datetime` columns written by the server use `DateTime.UtcNow`; Angular templates append `'Z'` before the `date` pipe.
- Where tests need to pin the clock, inject `TimeProvider` (registered as `TimeProvider.System` in `Program.cs`) and read `timeProvider.GetUtcNow().UtcDateTime` instead; tests replace it with a fixed provider. Precedent: `TokenUsagesController` (`UpdatedTime`, Taipei "today").

## Reading `SysConfig`

`SysConfig` (`auth.sql`) is a key/JSON-value table. Read a setting with `SELECT configValue … WHERE configKey = '…'` and parse with `System.Text.Json`. Throw `InvalidOperationException` (→ 500) when the row or the property is missing. Precedent: `AppUserRepository.GetDefaultPasswordAsync`. Exception: a secret checked by an auth filter returns `null` when missing and the filter answers 401 with a logged warning (`IIngestApiKeyReader`).

## One transaction across repositories

Wrap the calls in `using var scope = DbTransactionScope.Begin(); … scope.Complete();` (`Data/DbTransactionScope.cs`, READ COMMITTED, async flow). Connections enlist automatically; open them one at a time (a repository method must not open a second connection while its first is open), or the transaction escalates to distributed and fails. Repository methods that need their own atomicity use the same scope instead of `BeginTransaction()`, so an outer scope covers them. Fakes undo their writes on rollback via `FakeTransaction.OnRollback`. Precedent: `ModelPricesController` (price write + cost recompute).

## Child tables vs n-n links

- A pure junction table (two FKs, no identity of its own, e.g. `AppUserRole`, `CourseInCertification`) is an n-n link: `p-multiselect` in the form, delete-then-reinsert in one transaction in the repository, separate query on the same connection for reads.
- A child table with its own IDENTITY key plus data columns (e.g. `PartnerCourseGroup`, which `Promotion2` references) is a separate entity with its own CRUD, even when it looks like a junction table.

## FK nav objects and lookups

- Return FK targets as nav objects (`partner`, `courseGroup`, `publishStatus`) via Dapper multi-map, alongside the raw pkids. Precedent: `Course`.
- Lookup lists live at `/api/lookups/{plural}`. When the FK target has no feature of its own yet, put its lookup query on the consuming repository (`ICourseRepository` hosts `certifications` and `jobcategories`); move it when the feature arrives.
- `nchar` columns need `RTRIM()` in every SELECT, lookups included.
- Code/lookup tables with no `DisplayOrder` column sort by `pkid ASC` (`PublishStatus`, `CourseGroup`); tables with `DisplayOrder` sort by `DisplayOrder, pkid`.

## Cross-feature navigation

A list endpoint can accept FK query params that override the saved session filters (`/courses?partnerPkid=`, `?courseGroupPkid=`, `?publishStatusPkid=`). The parent's list and detail pages get a button (查看課程) that deep-links with the param. Precedent: Partner / CourseGroup / PublishStatus → Course.

## Sticky form toolbar

Every form page pins its Save/Cancel toolbar so it stays reachable on long forms. Precedent: all six `*-form` pages.

- Template: `<div class="page-header sticky-toolbar" id="form-toolbar">` as the first child of the `<form>`, holding `#cancel-button` and `#save-button`.
- Style is global only (`styles.scss`, `.page-header.sticky-toolbar`): `position: sticky; top: 0; z-index: 10`, a light shadow and `flex-wrap: wrap`. Don't copy it into component styles.
- The window scrolls (no inner scroll container), so `top: 0` pins inside the content column and never covers the sidebar. Keep `z-index` below PrimeNG overlays (`appendTo="body"` selects, datepickers) so their popups still open over the toolbar.
- Spec: `expectStickyToolbar(fixture.nativeElement)` from `core/testing/sticky-toolbar.ts`, once for add (`setup(null)`) and once for edit. It checks the computed sticky styles (Karma loads `styles.scss`) and that both buttons are inside the toolbar.
- List and detail page headers stay non-sticky.

## Dates and validation

- Date-range filters are `DateOnly` pairs, inclusive on both ends (`PasswordUpdatedFrom/To`).
- Cross-field rules return 400 from the controller (`Course`: `ScheduleOff < ScheduleOn`).
- Blank optional strings are stored as `NULL` (`Partner.ImageFilename`).
- Frontend date helpers live in `core/utils/date.util.ts`.

## Tests

- Backend tests run the real HTTP pipeline through `WebApplicationFactory<Program>` against an in-memory fake repository (`FakeAppRoleRepository` pattern); they never hit SQL, so verify new SQL manually (see `docs\gotchas.md` for smoke-testing without stopping the dev server).
- Endpoints need a bearer token, so test classes take `IClassFixture<ApiTestFactory>` (swaps in `FakeAuthRepository`, whose signing key the test tokens use) and call `_factory.CreateAuthenticatedClient()` instead of `CreateClient()`. Use a plain `CreateClient()` only to test anonymous or 401 behaviour (`AuthorizationApiTests`, `TokenUsagesApiTests`).
- Frontend specs of the app shell sign in first with `signIn(roles)` from `core/testing/auth.ts` (writes a fake profile to session storage before `AuthService` is created); `fakeToken(roles)` builds just the token.
- Frontend specs: when mocking `ActivatedRoute`, list its provider **after** `provideRouter(...)`, or the router's own provider overrides it.

## Dependency pins

`@angular/animations` ~20.3 and `@angular/cdk` ~20.2 are pinned to satisfy PrimeNG 20.4's peer ranges. Do not bump them independently.
