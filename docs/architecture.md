# BS-SAMS architecture

React/Vite serves the Thai interface. A same-origin Cloudflare Worker owns authentication, authorization and all D1 writes. D1 stores people with versioned JSON aggregates containing requests and assistance events. The person is the unit of authorization, optimistic concurrency and soft deletion. No personal data is persisted in browser storage.

A normalized request/payment schema was considered. The person aggregate keeps a multi-request edit atomic and prevents partial saves; it is suitable for the initial local-government workload. Aggregate reports expand request and payment JSON and group it inside D1. The Worker receives a single aggregate row rather than loading complete person records. D1 still scans scoped active aggregates; indexed normalized request/payment tables remain an option if measured database cost warrants a schema migration. Preserve the person authorization boundary during such a migration.

Roles are admin and staff. Staff permissions are independently assigned, intersected with village membership. Aggregate reports are available for all villages; person reads and exports require village access. Export also requires view permission. Summary endpoints return only counts, never person objects. Configuration and user endpoints require administrator access.

Sessions are random opaque HttpOnly SameSite=Strict cookies with an eight-hour expiration. HTTPS cookies are Secure. PBKDF2-SHA256 passwords have unique salts and 100,000 iterations, within Workers Web Crypto limits. Login is rate limited by trusted Cloudflare client IP. Password resets require changing the password before application access. Signed-in users can also change their own password; a successful change revokes all their sessions and requires a new login. Account changes revoke existing sessions.

Deletion is recoverable with actor, reason and date. User accounts are deactivated rather than physically removed to retain audit identities. Village removal is implemented as deactivation to retain historical addresses. Assistance type edits do not rewrite prior requests. Updates use a version precondition to avoid overwriting concurrent changes. The audit insert for person edits is conditional on the preceding update changing a row, in the same D1 transaction, so rejected stale edits do not appear as successful updates.

No file attachments, case follow-up scheduling, data import, public registration, or automatic deployment are included. A system logo is the sole image upload and is stored as a limited-size raster data URI.

Before production: create a real D1 database and replace the local placeholder binding, provision the initial administrator securely, test backup/restore and organization data-retention procedures, and verify data-location requirements for sensitive records. No Cloudflare resources have been created or deployed by this task.

A person is fully helped only when every request is done. Mixed done and closed requests count as partially helped. A person whose requests are all closed is classified as closed even when an earlier assistance event exists. The registry uses the shared domain function; report SQL is checked against the original JavaScript calculation for the same status rules.

The integration runner provisions a fresh local D1 state directory and its own Worker on an available loopback port. It deletes only its private fixture directory and stops its own Worker at the end; development D1 data and login limits are untouched.

## Registry queries

`GET /api/people` returns `{items,total,page,size}`. It accepts `q`, `village`, `status`, `cat`, `sort=name|village`, `direction=asc|desc`, `page`, `size` and administrator-only `trash=1`. Page size is bounded to 100. D1 applies authorization, search and filters before counting and slicing. Count and page reads execute in one batch. Sort ties use record ID for stable pages. Thai name ordering uses SQLite binary ordering, not ICU linguistic collation.

`POST /api/export` accepts `{filters: {...}}` and exports every matching active row regardless of the selected page. View and export permissions are intersected in SQL. The registry uses the same validated filter builder as exports. Summary report exports use `POST /api/report-export` with `{from,to}` and return aggregates only; they never return individual records to the browser. Summary reports scan scoped active JSON inside D1 and return only aggregates. Individual registry exports still return complete matching person result sets and are not a streaming large-data path.

The browser cancels obsolete list requests and clears old rows while loading. If a delete or edit empties the last page, it requests the new last page. Index migration 0002 supports name and village orderings. Status SQL is checked against the shared JavaScript rule over 1,885 empty, one-, two-, and three-request combinations, including requests with assistance events.

## Reporting periods and counting units

Summary and report-export endpoints validate real calendar dates in ascending order and permit at most 120 calendar month buckets. Every month is keyed by YYYY-MM, so October in different years is never merged. Empty months remain visible. Monthly rows distinguish unique applicants, request count, unique recipients, assistance event count and money. Applicants follow request dates; recipients and amounts follow assistance dates, including payments for requests submitted before the selected interval. Unique people across the whole interval must not be calculated by summing unique people per month.

The completion indicator shows the current status of requests submitted in the period, not a reconstruction of their historical status at the end date. Missing birth dates are reported separately. Custom date intervals are labeled as custom rather than retaining a misleading fiscal-year selection. Aggregate exports are permission-scoped in SQL before calculation and include a scope note in the generated workbook or CSV.

## Database report aggregation

`server/summary.js` owns the report query and D1 adapter. Both HTTP report routes validate the date range before calling `readSummary(db, from, to, selection)`. Dashboard calls use all active villages. Export calls pass the existing authorized SQL selection from `peopleSelection`; user input is bound, and the optional SQL fragment comes only from trusted internal code. One SELECT gives every metric the same database snapshot.

The query expands scoped requests once into a common table expression. It filters applicants by request date, groups them by person for current completion status, and counts each person once per category and village. It computes age on the report end date. Payments are filtered separately by assistance date from all scoped requests, including those submitted outside the period. Money is rounded to integer satang per event, summed as integers, then divided by 100 for the API. A recursive calendar fills empty months and preserves chronological order. The existing 120-month route limit bounds the calendar.

The result is one JSON aggregate containing totals, seven category counts, four age groups, village totals, and monthly rows. No identity, notes, or person objects cross from D1 into the Worker along this path. Response shape and counting units match the previous API, so the dashboard and CSV/Excel clients use their existing contract.

Keeping JavaScript aggregation with paged reads would reduce each read but still transfer person records and require a consistent multi-page snapshot. Normalizing requests and payments would support date indexes but would also change person writes and migration requirements. SQL over the existing JSON removes Worker record loading without changing the storage model. It does not guarantee lower D1 read charges or indexed date filtering.

`tests/helpers/reference-summary.js` retains the former implementation only as a test oracle. `tests/summary.test.js` compares actual SQLite query results against that oracle across 1,885 request-status combinations, report boundaries, ages, decimal amounts, soft deletion, village scopes and a 2,000-person dataset. Integration tests compare real local Worker/D1 responses against the same reference, including permission-scoped exports. No production code uses the in-memory report calculation.

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

## Versioned system configuration

Configuration JSON includes revision, defaulting to 0 for existing configurations without a revision field. GET /api/config always returns it. PUT requires the matching revision and performs a conditional upsert that increments it. The audit insert is conditional on that write succeeding, in the same batch. Two concurrent initial saves cannot both succeed. Stale writes return 409 and leave the stored settings and audit unchanged. No schema migration is needed.

Configuration parsing returns only known fields, trims names, removes blank or duplicate assistance type entries, and derives fixed category names from the domain list. Village IDs must remain present once saved; deactivation preserves historical addresses and permission assignments. New records and address moves require active villages; an existing record may retain its inactive address. The browser selects the first active village authorized for creation and disables creation when none exists.

The settings form keeps its draft on a conflict. Loading the latest configuration asks for confirmation when the draft differs from the last loaded or saved value. Saves use the normalized server response as the next baseline. The browser also registers a beforeunload warning while settings are dirty; it does not persist a draft or merge conflicting edits automatically.

## Person list and full-record access

Registry list items are explicit summaries containing ID, title, first/last names, derived age, village, person status and seven category statuses. Administrator trash lists also include deletion metadata. They omit birth date, national ID, telephone, house fields, disability fields, request notes and request/payment bodies. List items include the current version as a mutation precondition. Internal SQL filtering still supports exact or partial national ID searches without returning that value in the list response.

`GET /api/people/:id` returns the full current record and version only after checking view permission for its current village. Missing, deleted and unauthorized records return 404 in the normal detail path. Both the view and edit controls fetch through this endpoint rather than editing a stale list object. Obsolete requests are aborted when the dialog closes or changes mode. Export endpoints retain their existing separately checked contracts.

PersonDetails renders read-only facts, Thai calendar dates, overall totals, per-request status and closure reasons, and assistance events ordered by date. No disabled form inputs are used for reading. The edit button appears only for users with edit permission and requests the latest record again. Profile text, notes and assistance description fields are validated as bounded text at the API boundary to prevent malformed values breaking the display.

## Application navigation and dirty drafts

NavigationGuardProvider keeps a set of dirty form IDs in memory. useUnsavedChanges registers each form's boolean dirty state with that provider while retaining its browser beforeunload listener. Sidebar route changes, explicit logout, and entering the password-change workflow use the provider's guarded request method. Selecting the current route does not prompt. Cancelling the confirmation preserves the form; confirming runs the pending action. No draft fields, passwords or personal records are stored in the provider or persisted to browser storage.

Account editor opening captures a baseline and closing through Cancel, the close icon or Escape prompts only when values differ. Inputs are disabled while saving. Successful saves and component unmounts unregister their blockers. Settings success notices disappear after further edits. Session-expired events close pending navigation confirmations and return to login without waiting for a discard decision, so draft protection never extends expired access. This does not provide autosave or crash recovery.

## Additional registry filters

Registry and person exports accept ageGroup (child, youth, adult, senior, unknown), disability (none or 0–6), requestType, requestFrom and requestTo. Age is computed in D1 against the current Thailand date using the same birthday rule as the display; unknown matches missing birth dates. Disability membership is checked against the domain's seven stored labels and supports people with multiple disabilities.

Category, request type and request dates are combined inside one EXISTS predicate over requests. They cannot be satisfied by different requests belonging to the same person. Person status, village, identity search, age and disability remain person-level predicates. Type matching is exact; the browser provides current configured choices plus free-text entry for historical types. Date bounds are inclusive, optional and validated as real ordered dates. Additional fields are collapsed by default and cleared by the existing reset controls.

Permission village IDs are bound as one JSON array and expanded through json_each rather than a variable-length placeholder list. This keeps parameter counts bounded even when combining every filter. Filtering still precedes count and pagination, and exports use the same builder without the page limit. These filters do not add sensitive fields to registry list responses.

## Advisory duplicate checks

`POST /api/people/duplicate-check` accepts first/last names with optional birth date, phone, national ID and current person ID. It applies the same view/village scope as registry queries, excludes deleted records and the current ID, and returns at most five list-summary candidates plus their match reason and scoped total. A national-ID match is ordered first. Names alone do not trigger a warning; a birth-date or phone match must corroborate them. Identity data is carried in JSON rather than a URL.

PersonEditor checks before creation or when identity fields change. Users may preview an authorized existing record in a separate read-only dialog while their draft remains mounted. For name/birth or name/phone matches, an explicit confirmation can create or save a distinct person. A visible national-ID match has no override button. The database unique constraint remains the final authority for national IDs across all records, including deleted and unauthorized ones; those records are not revealed by this advisory endpoint. These are exact-field checks, not fuzzy matching, merging, or a global guarantee against concurrent no-ID duplicate creation. No data is automatically merged or deleted.

## Versioned trash lifecycle

DELETE /api/people/:id requires `{version,reason}` and administrator POST /api/people/:id/restore requires `{version}`. A transition from active to deleted, or deleted to active, uses a conditional update against both version and current deletion state. It increments the version and appends its audit entry in one batch only when the state actually changes. Repeating the same desired-state operation returns `{ok:true,changed:false,version}` without rewriting metadata, incrementing the version, or appending an audit record. Concurrent requests converge the same way. An old delete against a record restored since that request returns 409; it cannot delete the restored record again.

GET /api/people/:id?trash=1 provides full archived detail only to administrators and only while the record is deleted. Ordinary detail and export paths continue to exclude deleted records. The archive view displays deletion actor, timestamp and reason and exposes a restore action instead of editing. Both the table and detail restore actions require confirmation. Restoring retains the person, requests and assistance data, including historical inactive-village addresses, and clears current deletion metadata. This does not create an immutable archive of earlier deletion reasons.

## Versioned account changes

Account edits and administrator password resets require a positive integer `version` from the user list. Password rotation uses the authenticated database row's version after verifying the current password. Each successful update increments that version, inserts its audit entry, and revokes all target sessions in one D1 batch. Audit insertion depends on the update's `changes()` result; session deletion immediately follows and depends on that audit insertion. Keep these statements adjacent and ordered so a losing update cannot revoke sessions or append history.

Stale requests return HTTP 409 without changing credentials, permissions, or sessions. The account editor retains its draft on conflict. Administrators can cancel, confirm discarding their draft, and use the refresh button to review the latest account before editing again. Changing a password also invalidates older account-editor snapshots.

Migration `0004_account_versions.sql` preserves existing accounts and credentials and initializes their versions to 1. Apply local migrations before starting the updated Worker; remote migrations remain a separate deployment step. User creation and bootstrap specify insert columns explicitly so the version uses its database default.
