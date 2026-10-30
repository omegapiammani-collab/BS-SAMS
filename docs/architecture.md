# BS-SAMS architecture

React/Vite serves the Thai interface. A same-origin Cloudflare Worker owns authentication, authorization and all D1 writes. D1 stores people with versioned JSON aggregates containing requests and assistance events. The person is the unit of authorization, optimistic concurrency and soft deletion. No personal data is persisted in browser storage.

A normalized request/payment schema was considered. The person aggregate keeps a multi-request edit atomic and prevents partial saves; it is suitable for the initial local-government workload. Aggregate reports currently scan active records on the Worker. Move to normalized indexed requests and SQL aggregation before large-volume operation. Do not remove the person authorization boundary during that migration.

Roles are admin and staff. Staff permissions are independently assigned, intersected with village membership. Aggregate reports are available for all villages; person reads and exports require village access. Export also requires view permission. Summary endpoints return only counts, never person objects. Configuration and user endpoints require administrator access.

Sessions are random opaque HttpOnly SameSite=Strict cookies with an eight-hour expiration. HTTPS cookies are Secure. PBKDF2-SHA256 passwords have unique salts and 100,000 iterations, within Workers Web Crypto limits. Login is rate limited by trusted Cloudflare client IP. Password resets require changing the password before application access. Signed-in users can also change their own password; a successful change revokes all their sessions and requires a new login. Account changes revoke existing sessions.

Deletion is recoverable with actor, reason and date. User accounts are deactivated rather than physically removed to retain audit identities. Village removal is implemented as deactivation to retain historical addresses. Assistance type edits do not rewrite prior requests. Updates use a version precondition to avoid overwriting concurrent changes. The audit insert for person edits is conditional on the preceding update changing a row, in the same D1 transaction, so rejected stale edits do not appear as successful updates.

No file attachments, case follow-up scheduling, data import, public registration, or automatic deployment are included. A system logo is the sole image upload and is stored as a limited-size raster data URI.

Before production: create a real D1 database and replace the local placeholder binding, provision the initial administrator securely, test backup/restore and organization data-retention procedures, and verify data-location requirements for sensitive records. No Cloudflare resources have been created or deployed by this task.

A person is fully helped only when every request is done. Mixed done and closed requests count as partially helped. A person whose requests are all closed is classified as closed even when an earlier assistance event exists. The same function drives registry badges, category icons and report counts.

The integration runner provisions a fresh local D1 state directory and its own Worker on an available loopback port. It deletes only its private fixture directory and stops its own Worker at the end; development D1 data and login limits are untouched.

## Registry queries

`GET /api/people` returns `{items,total,page,size}`. It accepts `q`, `village`, `status`, `cat`, `sort=name|village`, `direction=asc|desc`, `page`, `size` and administrator-only `trash=1`. Page size is bounded to 100. D1 applies authorization, search and filters before counting and slicing. Count and page reads execute in one batch. Sort ties use record ID for stable pages. Thai name ordering uses SQLite binary ordering, not ICU linguistic collation.

`POST /api/export` accepts `{filters: {...}}` and exports every matching active row regardless of the selected page. View and export permissions are intersected in SQL. The registry uses the same validated filter builder as exports. Summary report exports use `POST /api/report-export` with `{from,to}` and return aggregates only; they never return individual records to the browser. Summary reports still scan active data and exports still return complete matching result sets; neither is a streaming large-data path yet.

The browser cancels obsolete list requests and clears old rows while loading. If a delete or edit empties the last page, it requests the new last page. Index migration 0002 supports name and village orderings. Status SQL is checked against the shared JavaScript rule over 1,885 empty, one-, two-, and three-request combinations, including requests with assistance events.

## Reporting periods and counting units

Summary and report-export endpoints validate real calendar dates in ascending order and permit at most 120 calendar month buckets. Every month is keyed by YYYY-MM, so October in different years is never merged. Empty months remain visible. Monthly rows distinguish unique applicants, request count, unique recipients, assistance event count and money. Applicants follow request dates; recipients and amounts follow assistance dates, including payments for requests submitted before the selected interval. Unique people across the whole interval must not be calculated by summing unique people per month.

The completion indicator shows the current status of requests submitted in the period, not a reconstruction of their historical status at the end date. Missing birth dates are reported separately. Custom date intervals are labeled as custom rather than retaining a misleading fiscal-year selection. Aggregate exports are permission-scoped in SQL before calculation and include a scope note in the generated workbook or CSV.

## Editing drafts and saved assistance

Person forms keep their draft only in component memory. An unsaved edit prompts before closing through Cancel, the close button or Escape, and registers a browser beforeunload warning while dirty. It is not an autosave or crash-recovery mechanism. Browsers may limit beforeunload prompts, especially on mobile. No personal data is written to localStorage or sessionStorage.

Draft requests and assistance events can be removed after confirmation. Persisted child IDs are retained on every person update; the API rejects dropping a saved request or payment. Existing event contents remain editable by authorized staff. Requests can be closed with a reason, and entire people can still be soft-deleted through the existing trash workflow. Nested records are checked for malformed values and duplicate IDs. Request summary cards jump to the corresponding section; the modal header remains visible while scrolling long records.

## Administrator audit history

`GET /api/audit` is administrator-only and returns `{items,total,page,size}` rather than an array limited to 200 rows. It accepts `from`, `to`, `actor`, `action`, `target`, `page` and `size`, with bounded page sizes and a known-action allowlist. Date bounds are inclusive Thailand calendar dates converted to UTC in SQL; the end is an exclusive next-day midnight bound. Substring filters are parameterized and treat SQL wildcard characters literally. New indexes support date, action and target queries.

Migration 0003 adds a nullable actor_username snapshot. Every newly appended audit record stores the actor's username at operation time. Old rows remain unchanged, and the interface identifies fallback display names as current names rather than pretending they are historical snapshots. Audit records contain action identifiers, actor identities and target identifiers, not passwords, national IDs, or case notes. The UI translates known actions to Thai. No public audit write, delete or export endpoint is provided. History is an operational log, not a before-and-after version archive.

## Account administration and password reset

User creation and edits validate username syntax, display name, exact boolean activation, known role, unique permissions, and unique existing village IDs. Staff operations require view permission; a staff account with capabilities must have at least one assigned village. Accounts with no permissions may have no village assignments. Missing edit targets return 404 instead of recording a successful edit. Administrators cannot deactivate or demote themselves.

Password reset is separate from permission editing. `POST /api/users/:id/reset-password` accepts a new temporary password, requires an administrator and an active target, and excludes the actor's own account. It updates the salted password hash, sets must_change, revokes every target session and appends a reset-password audit entry in one D1 batch. It never returns the temporary password. `PUT /api/users` cannot reset a password. Self-service changes continue to require the current password. UI confirmation fields are cleared when the reset dialog closes. Deactivation preserves the account and audit identity, revokes sessions, and prevents login until reactivated.

## Currency and assistance validation

Money conversion and formatting live in src/money.js. New assistance amounts must be nonnegative, finite, at most 999,999,999.99 THB per event, and precise to satang. Report totals accumulate integer satang and convert to THB only after summation, so 0.10 + 0.20 is reported as 0.30. Existing JSON amount fields remain unchanged; no data rewrite or schema migration is needed. Legacy amounts with fractional satang are rounded per event when deriving reports; editing those events requires correcting their precision. Invalid draft amounts display a correction prompt instead of a misleading zero total.

Request cards show the sum of assistance amounts. Item quantities may be fractional and require a unit for positive quantities. Request dates cannot precede birth or be in the future; assistance dates cannot precede the request or be in the future. Both browser constraints and API validation use the Thailand calendar date. Excel generation preserves finite numeric values as numeric cells, while text remains text and formula prefixes are escaped. CSV keeps its UTF-8 BOM and quoted text fields.
