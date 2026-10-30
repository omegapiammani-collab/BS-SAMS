# BS-SAMS architecture

React/Vite serves the Thai interface. A same-origin Cloudflare Worker owns authentication, authorization and all D1 writes. D1 stores people with versioned JSON aggregates containing requests and assistance events. The person is the unit of authorization, optimistic concurrency and soft deletion. No personal data is persisted in browser storage.

A normalized request/payment schema was considered. The person aggregate keeps a multi-request edit atomic and prevents partial saves; it is suitable for the initial local-government workload. Aggregate reports currently scan active records on the Worker. Move to normalized indexed requests and SQL aggregation before large-volume operation. Do not remove the person authorization boundary during that migration.

Roles are admin and staff. Staff permissions are independently assigned, intersected with village membership. Aggregate reports are available for all villages; person reads and exports require village access. Export also requires view permission. Summary endpoints return only counts, never person objects. Configuration and user endpoints require administrator access.

Sessions are random opaque HttpOnly SameSite=Strict cookies with an eight-hour expiration. HTTPS cookies are Secure. PBKDF2-SHA256 passwords have unique salts and 100,000 iterations, within Workers Web Crypto limits. Login is rate limited by trusted Cloudflare client IP. Password resets require changing the password before application access. Account changes revoke existing sessions.

Deletion is recoverable with actor, reason and date. User accounts are deactivated rather than physically removed to retain audit identities. Village removal is implemented as deactivation to retain historical addresses. Assistance type edits do not rewrite prior requests. Updates use a version precondition to avoid overwriting concurrent changes.

No file attachments, case follow-up scheduling, data import, public registration, or automatic deployment are included. A system logo is the sole image upload and is stored as a limited-size raster data URI.

Before production: create a real D1 database and replace the local placeholder binding, provision the initial administrator securely, test backup/restore and organization data-retention procedures, and verify data-location requirements for sensitive records. No Cloudflare resources have been created or deployed by this task.
