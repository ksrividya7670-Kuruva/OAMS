# OAMS — Official Appointment Management System

## Vibe-Coding Master Specification

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Version**  | 2.0 (replaces v1.0 blueprint)                                                |
| **Date**     | 23 September 2026                                                            |
| **Status**   | Build-ready. Single source of truth.                                         |
| **Audience** | AI coding agent (Claude Code / Cursor / etc.) + the human reviewing its work |

---

## 0. READ THIS FIRST — Rules for the AI Coding Agent

These rules apply to every prompt in this project. Follow them before anything else in this document.

1. **Build track by track (§22).** Never start a track until the previous track's "Done when" list passes. Never build features from a later track "while you're there".
2. **This document is the source of truth.** If code and this doc disagree, the doc wins. If the doc is silent or ambiguous, **stop and ask**. Do not invent behaviour. Add the question to §24 Open Questions.
3. **Enums are defined once, in §5.** Use those exact values everywhere: DB check constraints, Zod schemas, UI labels map and tests. Never create a synonym (e.g. `DECLINED` when the enum says `REJECTED`).
4. **Shared schemas.** Every request/response shape is a Zod schema in `packages/shared`. Both API and web import it. Never hand-write a duplicate type.
5. **No new dependencies** beyond §3.3 without asking.
6. **Every state change goes through a service function** that:
   - validates the permission,
   - validates the current state,
   - writes the change,
   - writes the audit event,
   - writes the domain event to the outbox,

   all in **one DB transaction**. No route handler writes to the DB directly.

7. **Every track ships its in-app notifications.** A feature is not done if the events listed for it in §14.4 don't reach the notification bell.
8. **Tests are part of the feature.** Each track lists required tests. Run `pnpm test` and `pnpm typecheck` before saying a track is done.
9. **Small commits, one concern each.** Migrations are never edited after being committed. Add a new migration instead.
10. **Never log secrets, OTPs, tokens, passwords, ID numbers, or personal-calendar/confidential titles.**

---

## 1. Product Summary

OAMS manages the full lifecycle of appointments with senior officials (Chairman, CEO, COO, CFO, CTO, Directors, Department Heads). The lifecycle is:

```text
request → review → schedule → approve → confirm → visitor check-in → meeting → notes/action items → close
```

Around this sit two supporting modules:

- **Calendars.** Every official has two calendars: **Org** and **Personal**.
- **To-Do list.** Every official has a personal To-Do list, which they can delegate to their PA/EA.

In this document, "official" and "VIP" mean the same thing: a person whose time is booked through OAMS.

### 1.1 Key decisions (these close the gaps found in v1)

| #   | Decision                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Single organization, internal deployment.** Every table still has `org_id` so multi-tenant is possible later. SaaS, billing, entitlements and AI features are **out of scope** for v2 (§25). |
| D2  | **One canonical appointment state machine (§10)** and one visit state machine (§15.2). v1 had two conflicting versions.                                                                        |
| D3  | **Priority = LOW / MEDIUM / HIGH on the request form.** URGENT exists but only staff can set it. Tasks use the same enum (§5).                                                                 |
| D4  | **Two calendars per official: ORG and PERSONAL (§8).** Both block availability. Personal details are hidden from everyone except the official, unless the official explicitly grants access.   |
| D5  | **In-app notifications are built in Track 1** as core infrastructure. Every later track registers its events. Email arrives in Track 1 too. SMS comes later (§14).                             |
| D6  | **One permission syntax:** `resource.action` + scope `OWN / ASSIGNED / ORG` (§6).                                                                                                              |
| D7  | **"Verification" is defined** as automated checks plus PA review (§10.4).                                                                                                                      |
| D8  | **Slot holds.** A slot chosen by a requester is held while the request is reviewed. Double-booking is prevented by a Postgres exclusion constraint (§11.4).                                    |
| D9  | **Rescheduling is a change request, not a state.** The appointment stays CONFIRMED on its old slot until the new slot is accepted (§10.6).                                                     |
| D10 | **Staff sign in with Microsoft SSO.** MFA is enforced by Entra. External requesters sign in with an email OTP. Local password login is for break-glass admin only (§17).                       |
| D11 | **India compliance is built in:** DPDP Act 2023 notice and consent, Aadhaar masking, CERT-In log retention, TRAI DLT for SMS (§17.6).                                                          |

---

## 2. Glossary

| Term              | Meaning                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| Official / VIP    | Person whose time is booked (CEO, Director…). Has a profile in `officials`.                                    |
| Support staff     | PA, EA or Office Admin assigned to an official.                                                                |
| Requester         | Person asking for an appointment. Either an employee (SSO) or an external guest (email OTP).                   |
| Org calendar      | Official's work calendar. Holds appointments, internal meetings and blocks. Visible to assigned support staff. |
| Personal calendar | Official's private calendar. Blocks time; details are hidden.                                                  |
| Hold              | Temporary calendar reservation while a request is under review. It expires automatically.                      |
| Change request    | A proposal to move or alter a CONFIRMED appointment.                                                           |
| Visit             | One visitor's physical presence for an appointment (arrival → check-out).                                      |
| Action item       | Follow-up captured in meeting notes. Can be converted into a To-Do task.                                       |
| Task / To-Do      | Item on an official's To-Do list.                                                                              |
| Outbox            | Table of domain events written in the same transaction as the change, then dispatched by a worker.             |

---

## 3. Tech Stack

### 3.1 Backend

- Node.js 22 LTS + TypeScript (strict)
- Express 4
- PostgreSQL 16, via the Knex query builder and Knex migrations
- Redis 7: cache, rate-limit store, pub/sub for live notifications, BullMQ backend
- Zod for validation (schemas live in `packages/shared`)
- Auth:
  - JWT signed with RS256
  - bcrypt, cost 12, for the break-glass admin only
  - OpenID Connect for Microsoft SSO
- Nodemailer for email
- Vitest + Supertest for testing

### 3.2 Frontend

- React 19 + TypeScript (strict)
- Vite
- Tailwind CSS 4, using CSS-first `@theme` tokens
- TanStack Query for server state
- React Router 7
- Custom component library in `apps/web/src/components/ui`. **No Radix, no shadcn, no Headless UI.** See §19.3 for the accessibility work this implies.
- Vitest + Testing Library

### 3.3 Approved additional dependencies

The agent may install only these without asking:

| Package                                   | Why                                         |
| ----------------------------------------- | ------------------------------------------- |
| `pnpm` workspaces                         | Monorepo with shared schemas                |
| `bullmq`                                  | Background jobs and scheduled jobs on Redis |
| `luxon`                                   | Timezone-safe date maths (API + web)        |
| `openid-client`                           | Microsoft OIDC with PKCE                    |
| `jose`                                    | RS256 JWT sign/verify                       |
| `helmet`, `cors`, `cookie-parser`         | HTTP security basics                        |
| `express-rate-limit` + `rate-limit-redis` | Rate limiting                               |
| `multer` + `file-type`                    | Uploads and real MIME sniffing              |
| `exceljs`                                 | XLSX export                                 |
| `pdfkit`                                  | PDF export                                  |
| `pino` + `pino-http`                      | Structured logging                          |
| `rrule`                                   | Recurrence rules (calendar + tasks)         |
| `@testing-library/user-event`, `msw`      | Frontend tests                              |
| `testcontainers` (optional)               | Throwaway Postgres/Redis in tests           |

---

## 4. Repository Structure & Conventions

### 4.1 Layout

```text
oams/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── core/            # db, redis, config, errors, auth, rbac, audit, outbox, jobs, notifications
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── officials/
│   │   │   │   ├── calendar/
│   │   │   │   ├── availability/
│   │   │   │   ├── appointments/
│   │   │   │   ├── scheduling/  # conflict + slot engine
│   │   │   │   ├── rooms/
│   │   │   │   ├── visits/
│   │   │   │   ├── meetings/    # notes + action items
│   │   │   │   ├── tasks/       # To-Do
│   │   │   │   ├── notifications/
│   │   │   │   ├── reports/
│   │   │   │   └── admin/
│   │   │   ├── jobs/            # BullMQ processors
│   │   │   └── server.ts
│   │   ├── migrations/
│   │   ├── seeds/
│   │   └── test/
│   └── web/
│       └── src/
│           ├── app/             # router, layouts, providers
│           ├── components/ui/   # custom component library
│           ├── features/        # appointments, calendar, todo, reception, notifications, admin…
│           ├── lib/             # api client, query keys, sse, format
│           └── styles/          # tailwind theme tokens
├── packages/
│   └── shared/                  # enums, zod schemas, permission constants, error codes
└── docs/                        # this spec, ADRs, API notes
```

Each module in `apps/api/src/modules/<name>/` contains:

```text
routes.ts       # express router, zod parse, calls controller
controller.ts   # maps HTTP ↔ service, no business logic
service.ts      # business rules, transactions, permission checks, audit, outbox
repo.ts         # knex queries only; always filtered by org_id and scope
events.ts       # domain event types this module emits
*.test.ts
```

### 4.2 Conventions

| Topic            | Rule                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| IDs              | UUID (`gen_random_uuid()`). Human references: `APT-2026-000184`, `TSK-2026-000012`, `VIS-2026-000051`, generated from a `reference_counters` table under a row lock.                                                           |
| DB naming        | `snake_case`. The API JSON is `camelCase`. Convert with Knex `postProcessResponse` / `wrapIdentifier`.                                                                                                                         |
| Time             | All instants are `timestamptz`, stored in UTC. Each official and user has an IANA `timezone` (default `Asia/Kolkata`). Availability rules are stored as local wall-clock times + timezone. Use Luxon only, never `Date` maths. |
| Standard columns | `id, org_id, created_at, created_by, updated_at, updated_by, version`. `version` is for optimistic locking: an update must include the version it read, and a mismatch returns `409 VERSION_CONFLICT`.                         |
| Soft delete      | Only for `users`, `officials`, `rooms` (`deleted_at`). Appointments and tasks are never deleted; they are cancelled.                                                                                                           |
| Idempotency      | `POST` endpoints that create things accept an `Idempotency-Key` header. It is stored in Redis for 24h, and a repeat returns the original response.                                                                             |
| Pagination       | Cursor-based: `?limit=25&cursor=…` → `meta.nextCursor`.                                                                                                                                                                        |

**Success envelope:**

```json
{ "success": true, "data": {}, "meta": {} }
```

**Error envelope:**

```json
{
  "success": false,
  "error": { "code": "APPOINTMENT_CONFLICT", "message": "Human readable", "details": [] }
}
```

Error codes live in `packages/shared/errors.ts`. Standard HTTP mapping:

| Status | Used for                                          |
| ------ | ------------------------------------------------- |
| 400    | Validation                                        |
| 401    | Not authenticated                                 |
| 403    | No permission                                     |
| 404    | Not found, **or no permission to know it exists** |
| 409    | State or version conflict                         |
| 422    | Business rule violation                           |
| 429    | Rate limited                                      |

---

## 5. Canonical Enums (single source — `packages/shared/enums.ts`)

```ts
Priority = LOW | MEDIUM | HIGH | URGENT; // URGENT: staff-only
AppointmentStatus =
  DRAFT |
  SUBMITTED |
  UNDER_REVIEW |
  INFO_REQUESTED |
  AWAITING_REQUESTER |
  PENDING_APPROVAL |
  CONFIRMED |
  CHECKED_IN |
  IN_PROGRESS |
  COMPLETED |
  CLOSED |
  REJECTED |
  CANCELLED |
  NO_SHOW |
  EXPIRED;
TerminalStatuses = CLOSED | REJECTED | CANCELLED | NO_SHOW | EXPIRED;
ChangeRequestStatus = PENDING | AWAITING_REQUESTER | APPROVED | REJECTED | WITHDRAWN | EXPIRED;
VisitStatus =
  EXPECTED | ARRIVED | CHECKED_IN | WITH_HOST | CHECKED_OUT | NO_SHOW | DENIED | CANCELLED;
TaskStatus = TODO | IN_PROGRESS | BLOCKED | DONE | CANCELLED; // "overdue" is DERIVED, never stored
TaskCategory =
  MEETING |
  APPROVAL |
  REVIEW |
  CALL |
  EMAIL |
  DOCUMENT |
  FOLLOW_UP |
  FINANCE |
  HR |
  OPERATIONS |
  ADMIN |
  PERSONAL |
  OTHER;
TaskSource = MANUAL | ACTION_ITEM | APPOINTMENT;
CalendarType = ORG | PERSONAL;
EventKind = APPOINTMENT | MEETING | BLOCK | TRAVEL | LEAVE | PERSONAL | HOLD;
BlockStrength = HARD | SOFT | NONE; // NONE = shown but does not block booking
Visibility = PUBLIC | INTERNAL | CONFIDENTIAL;
MeetingMode = IN_PERSON | ONLINE | PHONE;
RequesterType = EMPLOYEE | CUSTOMER | VENDOR | PARTNER | GOVERNMENT | VISITOR | OTHER;
SupportRole = PA | EA | OFFICE_ADMIN;
SupportRank = PRIMARY | SECONDARY;
Requirement = REQUIRED | OPTIONAL;
OfficialDecision = PENDING | APPROVED | REJECTED;
ApprovalMode = OFFICIAL_APPROVES_ALL | STAFF_CONFIRMS_ROUTINE;
BookingMode = SHOW_SLOTS | REQUEST_ONLY;
CancelReason =
  REQUESTER_CANCELLED |
  OFFICIAL_UNAVAILABLE |
  SCHEDULE_CONFLICT |
  EMERGENCY |
  DUPLICATE |
  NO_LONGER_REQUIRED |
  OTHER;
ConflictCode =
  OFFICIAL_BUSY |
  PERSONAL_BUSY |
  OUTSIDE_WORKING_HOURS |
  HOLIDAY |
  LEAVE |
  TRAVEL |
  PROTECTED_TIME |
  BUFFER |
  ROOM_BUSY |
  ROOM_CAPACITY |
  MIN_NOTICE |
  BOOKING_WINDOW |
  DAILY_CAPACITY |
  CONSECUTIVE_LIMIT |
  REQUIRED_OFFICIAL_BUSY |
  DUPLICATE_REQUEST;
ConflictSeverity = HARD | SOFT;
NotificationChannel = IN_APP | EMAIL | SMS;
RoleCode =
  SUPER_ADMIN |
  APPOINTMENT_ADMIN |
  OFFICIAL |
  PA |
  EA |
  RECEPTION |
  SECURITY |
  EMPLOYEE |
  GUEST |
  AUDITOR;
Scope = OWN | ASSIGNED | ORG;
```

**UI label map** (web, `features/*/labels.ts`):

- **Priority:** LOW → "Low", MEDIUM → "Medium", HIGH → "High", URGENT → "Urgent".
- **Status:** plain English, e.g. AWAITING_REQUESTER → "Waiting for your response" for a requester, and "Waiting for requester" for staff.

---

## 6. Roles, Permissions & Scope

### 6.1 Scope rules

- **OWN:** the record belongs to the user. They are the requester, the task owner, or the official themself.
- **ASSIGNED:** the user is active support staff for the record's official, or holds an active delegation from that official. Only rows in `official_support_staff` / `delegations` where `now()` is between `active_from` and `active_to` count.
- **ORG:** any record in the organization.
- Scope is enforced **in `repo.ts` queries** (the WHERE clause), not only in middleware. Search, exports and reports use the same scoped queries.

### 6.2 Permissions

```text
appointment.create      appointment.read        appointment.review      appointment.approve
appointment.reschedule  appointment.cancel      appointment.set_urgent  appointment.start
appointment.complete    appointment.close
calendar.read           calendar.write          calendar.read_personal  calendar.write_personal
availability.manage     official.manage         support_staff.manage    delegation.manage
room.read               room.manage             visit.read              visit.checkin
visit.checkout          visit.deny
task.read               task.write              task.assign             task.export
note.read               note.write
report.read             audit.read              user.manage             role.manage
settings.manage         holiday.manage
```

### 6.3 Role matrix

Key: **O** = OWN, **A** = ASSIGNED, **G** = ORG, **–** = none.

| Permission                               | SUPER_ADMIN | APPT_ADMIN   | OFFICIAL     | PA / EA | RECEPTION | SECURITY | EMPLOYEE | GUEST | AUDITOR |
| ---------------------------------------- | ----------- | ------------ | ------------ | ------- | --------- | -------- | -------- | ----- | ------- |
| appointment.create                       | G           | G            | O            | A       | –         | –        | O        | O     | –       |
| appointment.read                         | G           | G            | O            | A       | G¹        | G¹       | O        | O     | G²      |
| appointment.review                       | –           | G            | O            | A       | –         | –        | –        | –     | –       |
| appointment.approve                      | –           | –            | O            | A³      | –         | –        | –        | –     | –       |
| appointment.reschedule                   | –           | G            | O            | A       | –         | –        | O⁴       | O⁴    | –       |
| appointment.cancel                       | –           | G            | O            | A       | –         | –        | O        | O     | –       |
| appointment.set_urgent                   | –           | G            | O            | A       | –         | –        | –        | –     | –       |
| appointment.start / complete             | –           | G            | O            | A       | –         | –        | –        | –     | –       |
| calendar.read                            | G⁵          | G⁵           | O            | A       | –         | –        | –        | –     | –       |
| calendar.write                           | –           | G            | O            | A       | –         | –        | –        | –     | –       |
| calendar.read_personal                   | –           | –            | O            | A⁶      | –         | –        | –        | –     | –       |
| calendar.write_personal                  | –           | –            | O            | A⁶      | –         | –        | –        | –     | –       |
| availability.manage                      | G           | G            | O            | A       | –         | –        | –        | –     | –       |
| visit.checkin / checkout                 | –           | G            | –            | A       | G         | G        | –        | –     | –       |
| visit.deny                               | –           | –            | –            | –       | G         | G        | –        | –     | –       |
| task.read / write                        | –           | –            | O            | A⁷      | –         | –        | –        | –     | –       |
| task.assign                              | –           | –            | O            | A⁷      | –         | –        | –        | –     | –       |
| task.export                              | –           | –            | O            | A⁷      | –         | –        | –        | –     | –       |
| note.read / write                        | –           | –            | O            | A       | –         | –        | –        | –     | –       |
| report.read                              | G           | G            | O            | A       | –         | –        | –        | –     | G       |
| audit.read                               | G           | –            | –            | –       | –         | –        | –        | –     | G       |
| user/role/settings/holiday.manage        | G           | holiday only | –            | –       | –         | –        | –        | –     | –       |
| official/support_staff/delegation.manage | G           | G            | delegation O | –       | –         | –        | –        | –     | –       |

Notes on the matrix:

1. Reception and security see only the arrival fields: visitor name, host, time, room, reference. They never see the subject, purpose, attachments or notes.
2. Auditor is read-only and sees masked content for CONFIDENTIAL records.
3. Only when `official_support_staff.can_approve = true` **and** the appointment qualifies as "routine" under the official's `approval_mode` (§10.5).
4. Requesters can only _request_ a change (a change request). They cannot move a booking directly.
5. Admins see Org calendars as busy/free plus titles for non-confidential items. They **never** see personal calendar details.
6. Only if the official has granted `can_view_personal` / `can_edit_personal` to that staff member. Otherwise personal events appear as grey "Busy".
7. Excludes tasks with `visibility = PERSONAL`, which only the official ever sees.

**CONFIDENTIAL appointments:** support staff need `official_support_staff.can_view_confidential = true`. Without it they see "Confidential appointment" plus the time only.

---

## 7. Data Model (Postgres 16)

Enable the extensions `pgcrypto` and `btree_gist`. All tables carry the standard columns from §4.2 unless noted. FK = foreign key.

### 7.1 Identity & organization

```text
organizations        id, name, timezone, settings jsonb
users                id, org_id, email (unique per org), phone, full_name, designation, department_id,
                     auth_provider (MICROSOFT|EMAIL_OTP|LOCAL), external_subject (Entra oid),
                     password_hash (LOCAL only), totp_secret_enc (LOCAL only), status (ACTIVE|DISABLED),
                     timezone, theme (LIGHT|DARK|SYSTEM), last_login_at
roles                id, code (RoleCode), name
permissions          id, code, description
role_permissions     role_id, permission_id, scope
user_roles           user_id, role_id
refresh_tokens       id, user_id, token_hash, family_id, expires_at, revoked_at, user_agent, ip
email_otps           id, email, code_hash, expires_at, attempts, consumed_at
departments          id, org_id, name, head_user_id
consents             id, user_id|email, purpose, notice_version, granted_at, withdrawn_at
```

### 7.2 Officials & support

```text
officials            id, org_id, user_id, title (e.g. "CEO"), department_id, is_vip bool,
                     timezone, default_duration_min (30), buffer_before_min (0), buffer_after_min (15),
                     min_notice_min (120), max_advance_days (90), slot_granularity_min (15),
                     booking_mode (BookingMode), approval_mode (ApprovalMode),
                     default_visibility (Visibility), is_active
official_support_staff
                     id, official_id, user_id, support_role (SupportRole), rank (SupportRank),
                     routing_order int, can_approve bool, can_view_confidential bool,
                     can_view_personal bool, can_edit_personal bool, can_manage_tasks bool,
                     active_from, active_to
delegations          id, official_id, from_user_id, to_user_id, scope (ALL|APPOINTMENTS|TASKS),
                     starts_at, ends_at, reason, revoked_at
capacity_policies    id, official_id, max_meetings_per_day, max_meeting_minutes_per_day,
                     max_external_per_day, max_consecutive, min_break_after_consecutive_min,
                     on_exceed (BLOCK|WARN|REQUIRE_APPROVAL)
```

### 7.3 Calendars & availability

```text
calendars            id, official_id, type (CalendarType), color
                     UNIQUE (official_id, type)     -- every official has exactly one ORG + one PERSONAL
calendar_events      id, org_id, calendar_id, official_id, kind (EventKind), block_strength (BlockStrength),
                     title, description, location, start_at, end_at, all_day bool,
                     occupied_range tstzrange,      -- start/end widened by buffers; set by service
                     visibility (Visibility), appointment_id FK null, room_booking_id FK null,
                     hold_expires_at null, recurrence_rule text null, series_id uuid null,
                     original_start_at null,        -- for an edited single occurrence
                     status (ACTIVE|CANCELLED), external_source (NONE|OUTLOOK), external_id
availability_rules   id, official_id, weekday (1-7), start_local time, end_local time,
                     effective_from date, effective_to date null
availability_exceptions
                     id, official_id, date, start_local, end_local, type (EXTRA_AVAILABLE|UNAVAILABLE), reason
protected_blocks     id, official_id, weekday|date, start_local, end_local, label, block_strength
holidays             id, org_id, date, name, is_optional bool
```

**Double-booking guard** (the critical constraint):

```sql
ALTER TABLE calendar_events ADD CONSTRAINT no_overlap_hard
  EXCLUDE USING gist (official_id WITH =, occupied_range WITH &&)
  WHERE (status = 'ACTIVE' AND block_strength = 'HARD');
```

Appointments, confirmed meetings, HOLDs, LEAVE, TRAVEL and hard BLOCKs are written as `HARD`. Personal events default to `HARD`, and the official can mark one `SOFT`.

### 7.4 Rooms

```text
rooms                id, name, building, floor, capacity, equipment text[], is_active,
                     setup_min, cleanup_min
room_bookings        id, room_id, appointment_id, occupied_range tstzrange, status (ACTIVE|RELEASED)
                     EXCLUDE USING gist (room_id WITH =, occupied_range WITH &&) WHERE (status='ACTIVE')
```

### 7.5 Appointments

```text
appointments         id, org_id, reference_no, requester_user_id, requester_type,
                     requester_snapshot jsonb (name, org, designation, phone, email at submit time),
                     primary_official_id, subject, purpose, description, priority, priority_reason,
                     meeting_mode, visibility, duration_min, attendee_count,
                     preferred_windows jsonb [{date, from, to}] (1–3),
                     start_at null, end_at null, timezone, room_id null, online_link null,
                     status (AppointmentStatus), status_changed_at,
                     assigned_to_user_id null, sla_due_at, escalation_level int default 0,
                     info_request_note null, cancel_reason null, cancel_note null,
                     submitted_at, confirmed_at, completed_at, closed_at
appointment_officials
                     appointment_id, official_id, requirement (Requirement), decision (OfficialDecision),
                     decided_by, decided_at, decision_note
appointment_attendees
                     id, appointment_id, name, email, phone, organization, is_external bool,
                     needs (text: accessibility / interpreter / escort)
appointment_status_history
                     id, appointment_id, from_status, to_status, action, actor_id, note, at
appointment_proposals
                     id, appointment_id, change_request_id null, start_at, end_at, room_id,
                     hold_event_id, proposed_by, expires_at, chosen bool
change_requests      id, appointment_id, requested_by, reason, new_duration_min null,
                     preferred_windows jsonb, status (ChangeRequestStatus), resolved_by, resolved_at
attachments          id, owner_type (APPOINTMENT|TASK|NOTE), owner_id, file_name, mime, size_bytes,
                     storage_key, sha256, scan_status (PENDING|CLEAN|INFECTED|SKIPPED), uploaded_by
```

### 7.6 Visits, meetings, tasks

```text
visits               id, appointment_id, reference_no, visitor_name, phone, email, organization,
                     id_type null, id_last4 null,   -- NEVER a full ID/Aadhaar number
                     vehicle_no null, party_size, status (VisitStatus), qr_token_hash,
                     arrived_at, checked_in_at, with_host_at, checked_out_at, denied_reason, badge_no
meeting_notes        id, appointment_id, body (rich text / markdown), decisions, visibility, author_id
action_items         id, appointment_id, note_id, title, owner_user_id, due_date,
                     status (OPEN|DONE|CANCELLED), converted_task_id null
tasks                id, org_id, reference_no, official_id, title, description, category, priority,
                     status (TaskStatus), visibility (ORG|PERSONAL),
                     start_date null, due_at null, estimated_min null,
                     owner_user_id (the official), assignee_user_id, created_by,
                     requires_verification bool, verified_by null, verified_at null,
                     source (TaskSource), source_id null, series_id null, recurrence_rule null,
                     position numeric,              -- manual ordering in list/board
                     completed_at null, cancelled_at null
task_checklist_items id, task_id, text, done bool, position
task_comments        id, task_id, author_id, body
task_reminders       id, task_id, remind_at, channel, sent_at
task_watchers        task_id, user_id
task_dependencies    task_id, depends_on_task_id
```

Task indexes:

- `(official_id, status, due_at)`
- `(assignee_user_id, status)`
- `(source, source_id)`

### 7.7 Notifications, events, audit

```text
notifications        id, org_id, user_id, event_type, title, body, link (in-app route), priority,
                     entity_type, entity_id, dedupe_key UNIQUE, read_at null, created_at
notification_deliveries
                     id, notification_id, channel, status (QUEUED|SENT|FAILED|SKIPPED),
                     attempts, provider_message_id, last_error, sent_at
notification_preferences
                     user_id, event_type, channel, enabled   -- mandatory events ignore "disabled"
                     plus users.quiet_hours_start/end, users.digest_mode (OFF|DAILY)
notification_templates
                     id, event_type, channel, version, subject, body (with {{vars}}), is_active
outbox_events        id, org_id, event_type, aggregate_type, aggregate_id, payload jsonb,
                     occurred_at, dispatched_at null, attempts, last_error
audit_events         id, org_id, actor_id, actor_role, action, entity_type, entity_id,
                     changes jsonb, reason, ip, user_agent, correlation_id, occurred_at,
                     prev_hash, hash                -- hash chain, see §17.4
reference_counters   prefix, year, last_value   PRIMARY KEY (prefix, year)
settings             org_id, key, value jsonb   -- SLA hours, OTP config, retention days, etc.
```

---

## 8. Calendars — Org + Personal (for every official / VIP)

### 8.1 Concept

Every official gets **two calendars**, created automatically when the official profile is created.

|                          | **ORG calendar**                                                      | **PERSONAL calendar**                                                       |
| ------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Purpose                  | Work: appointments, internal meetings, travel, leave, protected time  | Private life: family, medical, personal commitments                         |
| Blocks bookings          | Yes                                                                   | Yes. Personal time is never bookable.                                       |
| Official sees            | Everything                                                            | Everything                                                                  |
| Assigned PA/EA sees      | Everything, except CONFIDENTIAL items without `can_view_confidential` | Grey **"Busy"** block only, unless the official granted `can_view_personal` |
| PA/EA can create/edit    | Yes                                                                   | Only with `can_edit_personal`                                               |
| Admin / Auditor          | Busy/free + titles of non-confidential items                          | Busy/free only, **never** titles                                            |
| Requesters               | Available slots only (if `booking_mode = SHOW_SLOTS`)                 | Nothing                                                                     |
| Reports, exports, search | Included (scoped)                                                     | **Excluded**                                                                |
| Audit log                | Normal                                                                | Records _that_ an event changed; **never stores the title or description**  |
| Colour                   | Brand blue                                                            | Purple (official's own view); grey "Busy" (everyone else)                   |

### 8.2 Calendar UI (`/app/calendar`)

- **Views:** Day, Week (default), Month, Agenda.
- **Layer toggles:** ☑ Org ☑ Personal ☑ Tasks (tasks with a due time appear as small markers).
- **Official switcher** for PA/EA who support more than one official.
- **Creating an event** always asks which calendar (Org or Personal), then:
  - the kind (Meeting / Block / Travel / Leave / Personal),
  - whether it blocks booking (Hard / Soft / Doesn't block),
  - its visibility,
  - recurrence (rrule),
  - a room (Org only).
- **Drag to move / resize:**
  - Plain events: saves directly.
  - An **appointment**: opens the Reschedule dialog (§10.6), never a silent move.
  - Personal events: only the official, or staff with `can_edit_personal`.
- **HOLD events** are shown striped amber with a countdown ("Hold expires in 5h").
- **Soft blocks** have a dashed border. **Hard blocks** are solid.
- **Recurring events:** editing asks "This event / This and following / All events".

### 8.3 Control Room (`/app/control-room`)

A multi-official side-by-side day/week grid for APPOINTMENT_ADMIN and for PA/EA with more than one official.

It has a **Find common slot** button, which runs the slot engine across the selected officials. The same visibility rules apply: personal time is always "Busy".

### 8.4 Outlook sync (Track 11)

- Org calendar ↔ Outlook work calendar: two-way.
- Personal calendar: **read free/busy only** from a chosen Outlook calendar. Never write, never import titles.
- Conflict rule: **OAMS is authoritative for appointments.**
  - If Outlook moves or deletes an OAMS-created appointment event, OAMS does not change the appointment. It raises a `CALENDAR_SYNC_MISMATCH` notification to the PA.
  - Other Outlook events are imported as `MEETING` / `BLOCK`.

---

## 9. Appointment Request Form (Requester Wizard)

Route: `/request` (public entry). The requester signs in first: SSO for staff, email OTP for guests. They can browse officials before signing in.

A progressive stepper with 6 steps. A draft auto-saves every 10 seconds, so a requester can leave and come back.

### Step 1 — Who do you want to meet?

- **Official:** a searchable card grid showing title, name and department. It shows only officials with `is_active`.
- **Also meet with (optional):** more officials, each marked Required or Optional (defaults to Required).

### Step 2 — Why?

- **Subject** (required, 5–120 chars)
- **Purpose category:** Business discussion / Approval request / Grievance / Proposal / Courtesy visit / Other
- **Description** (required, 20–2000 chars)
- **Priority** (required, radio cards, default **Medium**). See the table below.
- **"Why is this high priority?"** (text, 20–500 chars): **required only when High is chosen**.
- **Visibility:** staff requesters only (Internal / Confidential). Guests are always INTERNAL.

The priority selector:

```text
┌────────────┐ ┌────────────┐ ┌────────────┐
│  ● Low     │ │  ● Medium  │ │  ● High    │
│ Routine /  │ │ Standard   │ │ Time-      │
│ FYI        │ │ business   │ │ Reply ≤ 4  │
│ Reply ≤ 3  │ │ Reply ≤ 1  │ │ work hours │
│ work days  │ │ work day   │ │            │
└────────────┘ └────────────┘ └────────────┘
```

**What priority controls** (the hours are configurable in `settings`):

| Priority | Who can set it                        | Review SLA      | Escalation                                             | Badge colour |
| -------- | ------------------------------------- | --------------- | ------------------------------------------------------ | ------------ |
| LOW      | Anyone                                | 3 working days  | Reminder at 50%, escalate at 100%                      | Grey         |
| MEDIUM   | Anyone (default)                      | 1 working day   | Reminder at 50%, escalate at 100%                      | Blue         |
| HIGH     | Anyone + mandatory reason             | 4 working hours | Reminder at 50%, escalate at 100%                      | Orange       |
| URGENT   | Staff only (`appointment.set_urgent`) | Immediate       | All support staff **and** the official alerted at once | Red          |

- Staff can change priority with a reason. The change is audited and the requester is notified.
- Priority **never bypasses approval**. It only changes the SLA, escalation, sort order and badge.
- SLA clocks count **working hours only** (org working hours minus holidays).

### Step 3 — When?

- **Duration:** 15 / 30 / 45 / 60 / 90 min. Defaults to the official's default. More than 60 min shows the hint "Long meetings need official approval".
- **Meeting mode:** In person / Online / Phone.

What the requester picks depends on the official's booking mode:

- **If `booking_mode = SHOW_SLOTS`:** show the next 14 days of recommended slots from the slot engine. The requester picks one; that creates a HOLD on submit. They can also pick "None of these work — let me suggest times".
- **If `REQUEST_ONLY`** (typical for VIPs): the requester gives 1–3 preferred windows (date + from–to). No slots are revealed.

### Step 4 — Who's attending?

- Attendee rows: name, organization, email, phone, external?, special needs.
- `attendee_count` is computed. If it exceeds 20, show the warning "Large group — the office will confirm a room".

### Step 5 — Documents (optional)

- Up to 5 files, 10 MB each.
- Allowed: pdf, docx, xlsx, pptx, jpg, png. Type is sniffed server-side.

### Step 6 — Review & submit

- Full summary with an Edit link per section.
- **DPDP notice** (versioned, §17.6) and consent checkbox (required).
- Submit shows the reference number (`APT-2026-000184`), the SLA text ("You'll hear back within 1 working day") and a "Track status" link.

### 9.1 Validation (Zod, shared)

- The preferred window start must be ≥ now + `min_notice_min` and ≤ now + `max_advance_days`.
- The window must fall on a working day for the official.
- The end time is always computed by the server; never trust a client-sent end.
- Email and phone formats are checked. Indian mobile numbers are normalised to E.164.
- **Duplicate check:** if the same requester has an active (non-terminal) appointment with the same official whose preferred date is within 7 days:
  - **warn** with a link to it;
  - **block** if that duplicate was submitted in the last 24h with the same subject.

### 9.2 Requester status page (`/my/appointments/:id`)

A progress tracker:

```text
Submitted ✓ → Under review ● → Scheduled ○ → Confirmed ○ → Meeting ○ → Done ○
```

It shows:

- the current status text, and what the requester must do (if anything);
- the confirmed time, location or online link, and what to bring;
- the change history ("Moved from 28 Sep 11:00 to 29 Sep 15:00").

Available actions, depending on state:

- Respond to info request
- Accept one of the proposed times, or decline all
- Request a change
- Cancel
- Download calendar invite (.ics)

The page **never** shows internal notes, which staff member is handling the request, or the official's other commitments.

---

## 10. Appointment Lifecycle (canonical)

### 10.1 State diagram

```text
DRAFT ──submit──▶ SUBMITTED ──auto-checks pass──▶ UNDER_REVIEW
                     │ auto-checks fail (duplicate/blocked)──▶ REJECTED

UNDER_REVIEW ──request info──▶ INFO_REQUESTED ──requester responds──▶ UNDER_REVIEW
                                     └──no response in N days──▶ EXPIRED
UNDER_REVIEW ──propose times──▶ AWAITING_REQUESTER ──requester accepts one──▶ (PENDING_APPROVAL | CONFIRMED)
                                     ├──requester declines all──▶ UNDER_REVIEW
                                     └──proposals expire──▶ UNDER_REVIEW (PA notified)
UNDER_REVIEW ──slot set, needs official──▶ PENDING_APPROVAL
UNDER_REVIEW ──slot set, routine & staff can confirm──▶ CONFIRMED
UNDER_REVIEW ──reject──▶ REJECTED

PENDING_APPROVAL ──all REQUIRED officials approve──▶ CONFIRMED
PENDING_APPROVAL ──any REQUIRED official rejects──▶ REJECTED
PENDING_APPROVAL ──official suggests other time──▶ AWAITING_REQUESTER

CONFIRMED ──first visitor checked in──▶ CHECKED_IN ──start──▶ IN_PROGRESS
CONFIRMED ──start (internal meeting, no external visitors)──▶ IN_PROGRESS
CONFIRMED ──grace period passed, nobody arrived──▶ NO_SHOW
IN_PROGRESS ──complete──▶ COMPLETED ──close (manual, or auto after 14 days)──▶ CLOSED

Any non-terminal state ──cancel──▶ CANCELLED
```

Terminal states: `CLOSED`, `REJECTED`, `CANCELLED`, `NO_SHOW`, `EXPIRED`. None of these transitions further. A terminal appointment is final: to "revive" one, create a new appointment with `source_appointment_id` pointing at the old one.

### 10.2 Transition table

This is the authoritative table. It is implemented as a single map in `appointments/state-machine.ts`, and every row needs a test.

| From                   | Action              | To                                     | Who (permission)        | Guards                                                                  | Side effects                                                     |
| ---------------------- | ------------------- | -------------------------------------- | ----------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| DRAFT                  | submit              | SUBMITTED                              | creator                 | form valid, consent given                                               | reference no., SLA start, HOLD created if slot chosen            |
| SUBMITTED              | (system) autoCheck  | UNDER_REVIEW / REJECTED                | system                  | §10.4                                                                   | route + assign (§10.3)                                           |
| UNDER_REVIEW           | requestInfo         | INFO_REQUESTED                         | review                  | note required                                                           | SLA paused                                                       |
| INFO_REQUESTED         | respondInfo         | UNDER_REVIEW                           | requester               | response text or file                                                   | SLA resumes                                                      |
| INFO_REQUESTED         | (job) expire        | EXPIRED                                | system                  | `info_response_days` (default 5) passed                                 | release hold                                                     |
| UNDER_REVIEW           | proposeTimes        | AWAITING_REQUESTER                     | review                  | 1–3 slots, each passes conflict check                                   | a HOLD per proposal, expiring in `proposal_hold_hours` (24)      |
| AWAITING_REQUESTER     | acceptProposal      | PENDING_APPROVAL / CONFIRMED           | requester               | proposal not expired; final conflict re-check                           | chosen hold kept, others released                                |
| AWAITING_REQUESTER     | declineAll          | UNDER_REVIEW                           | requester               | optional note                                                           | release holds                                                    |
| AWAITING_REQUESTER     | (job) expire        | UNDER_REVIEW                           | system                  | all proposals expired                                                   | release holds, notify PA                                         |
| UNDER_REVIEW           | schedule            | PENDING_APPROVAL / CONFIRMED           | review                  | slot passes conflict check; CONFIRMED only if routine (§10.5)           | hold created or converted                                        |
| UNDER_REVIEW           | reject              | REJECTED                               | review                  | reason required                                                         | release hold                                                     |
| PENDING_APPROVAL       | approve             | CONFIRMED (when all REQUIRED approved) | approve                 | final conflict re-check                                                 | HOLD → APPOINTMENT event; room booked; visits created; .ics sent |
| PENDING_APPROVAL       | reject              | REJECTED                               | approve                 | reason required                                                         | release hold                                                     |
| PENDING_APPROVAL       | suggestOther        | AWAITING_REQUESTER                     | approve                 | 1–3 slots                                                               | holds                                                            |
| CONFIRMED              | checkIn (via visit) | CHECKED_IN                             | visit.checkin           | a visit reaches CHECKED_IN                                              | —                                                                |
| CONFIRMED / CHECKED_IN | start               | IN_PROGRESS                            | appointment.start       | within 30 min of start_at; from CONFIRMED only if no external attendees | actual_start stored                                              |
| CONFIRMED              | (job) markNoShow    | NO_SHOW                                | system                  | `start_at + noshow_grace_min` (30) passed and no visit arrived          | PA notified; visits → NO_SHOW                                    |
| IN_PROGRESS            | complete            | COMPLETED                              | appointment.complete    | —                                                                       | actual_end stored; prompt for notes                              |
| COMPLETED              | close               | CLOSED                                 | appointment.close / job | manual, or 14 days after completion                                     | —                                                                |
| any non-terminal       | cancel              | CANCELLED                              | appointment.cancel      | reason required; requester only before CHECKED_IN                       | release hold/event/room; visits → CANCELLED                      |

Every transition does the same things, in one DB transaction:

- writes `appointment_status_history`;
- writes an `audit_events` row;
- writes an `outbox_events` row, with event type `Appointment<Action>`, e.g. `AppointmentConfirmed`.

### 10.3 Routing (who reviews)

```text
function resolveAssignee(official, at = now):
  1. Collect active delegations for the official (scope ALL or APPOINTMENTS).
     If there is one → return delegation.to_user.
  2. Collect support staff whose active_from ≤ now ≤ active_to and user is ACTIVE,
     ordered by routing_order (default: PA PRIMARY, PA SECONDARY, EA PRIMARY, EA SECONDARY, OFFICE_ADMIN).
     Skip anyone with an ORG-calendar LEAVE event covering `at`.
     Return the first one.
  3. None found → return the official themself.
  4. Official inactive → assign to APPOINTMENT_ADMIN queue (assigned_to = null, flagged UNASSIGNED).
```

- Re-routing runs again if a delegation starts or ends while the appointment is still in review. A job does this every 15 minutes.
- **Multi-official appointments:** routed to the **primary official's** staff. The support staff of the other required officials are each notified and can record their official's decision.

### 10.4 "Verification" (SUBMITTED → UNDER_REVIEW)

**Automated checks (synchronous, run on submit):**

1. The requester's identity is verified: SSO, or an email OTP completed during this session.
2. The duplicate rule (§9.1) passes.
3. All attachments have `scan_status` of `CLEAN` or `SKIPPED`. If a scan is pending, the appointment still moves to review with a flag.
4. The requester is not disabled.

If check 2 or 4 fails → `REJECTED` with a system reason. Otherwise → `UNDER_REVIEW` and assigned (§10.3).

**Manual review** by the PA/EA in UNDER_REVIEW is the human verification step. The review screen shows a checklist: identity OK, purpose clear, right official, attachments reviewed. That checklist is recorded in the audit log.

### 10.5 Approval authority

- `officials.approval_mode = OFFICIAL_APPROVES_ALL`: everything goes to PENDING_APPROVAL.
- `STAFF_CONFIRMS_ROUTINE`: a staff member with `can_approve = true` may confirm directly **only if** the appointment is routine. Routine means all of:
  - priority is LOW or MEDIUM,
  - duration ≤ 30 min,
  - visibility is not CONFIDENTIAL,
  - there is exactly one official,
  - no capacity warning.
- Anything else goes to PENDING_APPROVAL.
- **Multi-official:** every REQUIRED official must approve. OPTIONAL officials are only notified; their decision is informational. If one REQUIRED official rejects, the PA can either reject the whole appointment or remove that official (with a reason) and continue.

### 10.6 Rescheduling = Change Request (appointment stays CONFIRMED)

```text
CONFIRMED appointment
  ├─ Requester clicks "Request change" → change_request PENDING (reason + preferred windows)
  │     → PA reviews → proposes slots (holds) → change_request AWAITING_REQUESTER
  │     → requester accepts → APPROVED → move (below)
  └─ Staff clicks "Reschedule" → picks slot
        → if the new slot is ≥ 24h away and the requester has accepted "staff may move" in the notice: move directly + notify
        → else proposals → requester accepts → move
```

**Move (atomic, one transaction):**

1. Insert the new APPOINTMENT event (this fails on the exclusion constraint if the slot was taken).
2. Insert the new room booking (also constraint-protected).
3. Update the appointment's `start_at` / `end_at` / `room_id` and increment `version`.
4. Cancel the old event and release the old room booking.
5. Write status history (action `rescheduled`, old → new), audit and outbox (`AppointmentRescheduled`).

If step 1 or 2 fails, everything rolls back, the old booking stays intact, and the API returns `409 SLOT_TAKEN` with fresh alternatives.

### 10.7 Holds

- A hold is a `calendar_events` row with `kind = HOLD`, `block_strength = HARD` and `hold_expires_at`.
- Hold lifetime:
  - requester-picked slot: until the review SLA deadline, max 48h;
  - proposal: 24h.
- The `hold-expiry` job runs every minute. It cancels expired holds and applies the §10.2 transition.
- On confirm, the hold row is **converted** (kind → APPOINTMENT, `hold_expires_at` → null), not deleted and re-inserted. This means no other booking can slip into the gap.

---

## 11. Scheduling Engine (conflicts + smart slots)

### 11.1 Inputs

```ts
{ officialIds: {id, requirement}[], durationMin, windows: {from, to}[] | {rangeStart, rangeEnd},
  roomRequired: boolean, minCapacity?: number, equipment?: string[],
  priority, meetingMode, excludeAppointmentId?, respectMinNotice: boolean }
```

### 11.2 Conflict check (`POST /api/v1/scheduling/check`)

For a proposed `[start, end)`, evaluate the checks in this order and collect **all** results (don't stop at the first):

| Check                                            | Code                                             | Severity                              |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------------------- |
| Outside availability rules/exceptions            | OUTSIDE_WORKING_HOURS                            | HARD                                  |
| Holiday (non-optional)                           | HOLIDAY                                          | HARD                                  |
| LEAVE / TRAVEL event                             | LEAVE / TRAVEL                                   | HARD                                  |
| Overlaps a HARD org event or hold (with buffers) | OFFICIAL_BUSY                                    | HARD                                  |
| Overlaps a HARD personal event                   | PERSONAL_BUSY (message never includes the title) | HARD                                  |
| Overlaps a SOFT protected block                  | PROTECTED_TIME                                   | SOFT                                  |
| Buffer squeezed but not overlapped               | BUFFER                                           | SOFT                                  |
| Another REQUIRED official is busy                | REQUIRED_OFFICIAL_BUSY                           | HARD                                  |
| An OPTIONAL official is busy                     | REQUIRED_OFFICIAL_BUSY (flag `optional:true`)    | SOFT                                  |
| Room overlap / too small                         | ROOM_BUSY / ROOM_CAPACITY                        | HARD                                  |
| start < now + min_notice                         | MIN_NOTICE                                       | HARD (staff may override with reason) |
| start > now + max_advance                        | BOOKING_WINDOW                                   | HARD                                  |
| Daily capacity exceeded                          | DAILY_CAPACITY                                   | per `on_exceed`                       |
| Too many consecutive meetings                    | CONSECUTIVE_LIMIT                                | per `on_exceed`                       |

Response:

```json
{
  "bookable": false,
  "conflicts": [
    {
      "code": "OFFICIAL_BUSY",
      "severity": "HARD",
      "officialId": "…",
      "message": "CEO has another commitment 14:00–14:30"
    }
  ],
  "canOverride": false
}
```

**Override rules:**

- SOFT conflicts can be accepted by staff.
- HARD conflicts can be overridden only for `MIN_NOTICE` and `PROTECTED_TIME` by staff with `appointment.approve`, with a mandatory reason, and it is audited as an `OVERRIDE`.
- **Busy, leave, holiday and room conflicts are never overridable.** The only way past them is to move or cancel the other event.

### 11.3 Slot recommendation (`POST /api/v1/scheduling/slots`)

```text
1. Range: default next 14 days from max(now + min_notice, rangeStart). Cap 31 days.
2. For each day, for each REQUIRED official, build free intervals:
     availability windows − holidays − leave/travel − HARD events(ORG+PERSONAL, buffered) − holds
3. Intersect the free intervals of all REQUIRED officials.
4. Slide a window of durationMin in steps of slot_granularity_min (15) → candidates.
5. Drop candidates failing any HARD check (room availability included when roomRequired).
6. Score each (weights in settings, default):
     +40 inside a requester-preferred window
     +20 earlier date (linear decay over range)
     +15 all OPTIONAL officials free
     +10 preferred room free
     +10 keeps ≥ 15 min gap either side (not squeezed)
     −20 day already ≥ 80% of daily capacity
     −10 would create back-to-back chain at consecutive limit
7. Return top 5 (max 10) with reasons[] built from which rules scored.
```

Output per slot:

```json
{
  "start": "…",
  "end": "…",
  "roomId": "…",
  "score": 85,
  "reasons": [
    "All required officials free",
    "Inside your preferred window",
    "Board Room free",
    "15-min buffer kept before next meeting"
  ]
}
```

- Performance target: < 1.5s for 3 officials × 14 days.
- Cache each official's busy intervals in Redis for 60s, keyed by `official:{id}:busy:{date}`. Invalidate the key on any `calendar_events` change for that official.

### 11.4 Concurrency guarantee

- The final re-check happens inside the write transaction, and the Postgres exclusion constraint is the last line of defence.
- Catch the Postgres error code `23P01` (exclusion violation) and return `409 SLOT_TAKEN`.
- **Required test:** fire 20 parallel confirms for the same slot. Exactly 1 succeeds.

---

## 12. To-Do List (per official)

### 12.1 Principles

- Every official has one task list, scoped by `official_id`. It is independent of appointments.
- `visibility = ORG` tasks are visible to assigned PA/EA who have `can_manage_tasks`.
- `visibility = PERSONAL` tasks are **visible only to the official**. They never appear to PA/EA, admins, exports, reports or audit payloads (audit records the ID only).
- Overdue is **derived**: `status ∉ {DONE, CANCELLED} AND due_at < now()`. It is never stored as a status.

### 12.2 Task lifecycle

```text
TODO ──start──▶ IN_PROGRESS ──complete──▶ DONE ──(requires_verification)──▶ verified_at set
  │                 │  └──block(reason)──▶ BLOCKED ──unblock──▶ IN_PROGRESS
  │                 └──complete──▶ DONE
  └──complete──▶ DONE                   (a task can be ticked straight from TODO)
TODO / IN_PROGRESS / BLOCKED ──cancel(reason)──▶ CANCELLED
DONE / CANCELLED ──reopen──▶ TODO
```

If `requires_verification` is set, DONE shows the badge "Awaiting your verification" to the official until they verify it or reopen it.

### 12.3 Screens (`/app/todo`)

**Header**

- Official switcher (for PA/EA)
- Search
- View switch: **List | Board | Calendar**
- "+ New task"
- Export menu

**Quick-add bar** (always visible at the top)

- Type a title and press Enter. The task is created with priority MEDIUM, category OTHER, due date none, visibility ORG. An official can set their personal default visibility to PERSONAL in their preferences.
- Inline chips next to the input: 📅 due, ⚑ priority, 👤 assign, 🔒 personal.

**List view** (default)

- Grouped as: **Overdue** (red) · **Today** · **Tomorrow** · **This week** · **Later** · **No date** · **Done** (collapsed).
- Each row shows:
  - checkbox (complete),
  - priority flag,
  - title,
  - category chip,
  - due (relative, red if overdue),
  - assignee avatar,
  - 🔒 if personal,
  - 🔁 if recurring,
  - link icon if it came from a meeting.
- Drag to reorder within a group (updates `position`).
- Multi-select then bulk actions: Complete · Change priority · Change due date · Assign · Cancel.

**Board view:** Kanban columns TODO · IN_PROGRESS · BLOCKED · DONE. Dragging a card between columns changes its status. Moving a card to BLOCKED asks for a reason.

**Calendar view:** tasks with due dates laid out on a month/week grid. Dragging a task changes its due date.

**Side filters**

- My tasks / Delegated by me / Delegated to me
- Priority
- Category
- Source (Manual / From meeting)
- Recurring
- Personal / Org
- Due range

**Task detail drawer**

- Title, description (markdown), status, priority, category, due, estimate, assignee, visibility
- Checklist (sub-items with a progress bar)
- Comments, attachments
- Reminders (add several: "1 day before", "1 hour before", custom)
- Recurrence (Daily / Weekdays / Weekly on… / Monthly on… / Yearly / Custom rrule)
- Dependencies ("blocked by TSK-…")
- Source link ("From meeting APT-2026-000184 on 28 Sep")
- Activity history

**Dashboard widget** (official home): Overdue 2 · Today 5 · Upcoming (7 days) 12 · High priority 3 · Done today 4. Each number opens the filtered list.

### 12.4 Delegation

- Only the official, or staff with `can_manage_tasks`, can assign a task to another user. That user must be the official's support staff or an employee in the org.
- The assignee sees the task in "Delegated to me" and in their own dashboard widget. They can change its status, add comments, and complete it. **They can't change the title, priority or due date** unless they are the official or staff with `can_manage_tasks`.
- On completion, the official is notified. If `requires_verification` is set, the official must verify it.
- PERSONAL tasks can't be delegated; the UI hides the assign control for them.

### 12.5 From meetings

- Meeting notes (§16) capture action items.
- Clicking "Convert to task" on an action item creates a task with:
  - `source = ACTION_ITEM`, `source_id` = the action item ID,
  - the owner and due date copied over,
  - a back-link to the appointment.
- The action item stores `converted_task_id`. When the task is completed, the action item is marked DONE automatically.

### 12.6 Recurring tasks

- A series template is stored with `recurrence_rule` + `series_id`.
- The `recurring-task-generate` job (runs daily at 00:15 in the org timezone) creates the next occurrence(s) up to 14 days ahead.
- Each occurrence has its own status and history.
- Editing asks "This task / All future tasks".

### 12.7 Export

- Formats: **CSV, XLSX (exceljs), PDF (pdfkit)**.
- Scope: current filter, selected tasks, or a date range.
- PERSONAL tasks are included only when the official themself exports.
- Filename: `OAMS_Todo_<OfficialTitle>_<YYYY-MM-DD>.<ext>`.
- Columns: Task No, Title, Description, Category, Priority, Status, Due, Assignee, Source, Created, Completed.
- More than 2000 rows → background job, followed by an in-app notification "Your export is ready" with a download link that is valid for 24h.
- Every export writes an audit event: format, filter, row count, file reference.

---

## 13. Rooms & Capacity

- Rooms are managed in admin. Booking a room validates:
  - capacity ≥ attendee_count + officials,
  - required equipment,
  - availability with `setup_min` / `cleanup_min` added to the occupied range.
- Online meetings don't need a room.
- Capacity policies (§7.2) are evaluated by the conflict engine (§11.2).
- The official dashboard shows a capacity bar: "5 of 8 meetings · 210 of 360 min".

---

## 14. Notifications (IN-APP FIRST — built in Track 1)

### 14.1 Architecture

```text
service (tx) ──writes──▶ outbox_events
                              │  (worker: outbox-dispatch, polls every 1s via BullMQ repeatable job)
                              ▼
                    notification router
          (event catalog → recipients → preferences → quiet hours → dedupe)
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
   IN_APP (insert        EMAIL (queue            SMS (Track 11,
   notifications row,     email-send → Nodemailer, DLT templates)
   Redis PUBLISH          template render)
   user:{id})
        │
        ▼
   SSE stream → browser → bell badge + toast + TanStack Query invalidation
```

### 14.2 In-app delivery

- `POST /api/v1/notifications/stream-ticket` returns a single-use ticket valid for 60s. It is stored in Redis. This is needed because EventSource can't send the Authorization header.
- `GET /api/v1/notifications/stream?ticket=…` is an SSE stream:
  - it subscribes to the Redis channel `user:{id}`;
  - it sends a heartbeat comment every 25s;
  - events: `notification` (payload = the notification row), `unread-count`.
- Fallback: if SSE fails 3 times, the client polls `GET /notifications/unread-count` every 60s.

Other endpoints:

```http
GET   /api/v1/notifications?unread=true&cursor=
POST  /api/v1/notifications/:id/read
POST  /api/v1/notifications/read-all
GET   /api/v1/notification-preferences
PUT   /api/v1/notification-preferences
```

- **Bell UI:**
  - top bar bell with an unread badge (99+ max);
  - the popover shows the latest 10, grouped Today / Earlier;
  - clicking an item marks it read and navigates to its `link`;
  - "Mark all read"; "View all" opens `/app/notifications`.
- **Toast:** HIGH/URGENT notifications also show a toast. URGENT toasts stay until dismissed and play a soft sound (the user can mute it in preferences).
- **Live UI refresh:** each event type maps to TanStack Query keys to invalidate. For example, `AppointmentConfirmed` invalidates `['appointments']`, `['calendar', officialId]` and `['dashboard']`.

### 14.3 Rules

- **Dedupe:** `dedupe_key = eventType:entityId:recipientId:version`. The unique index stops duplicates if a worker retries.
- **Preferences:** per event type × channel. Events marked **Mandatory** in §14.4 ignore opt-outs for IN_APP.
- **Quiet hours** (per user, default off): EMAIL/SMS are held until the quiet hours end. IN_APP is still stored. URGENT ignores quiet hours.
- **Digest:** if `digest_mode = DAILY`, LOW/MEDIUM informational emails are batched into one 08:00 email. IN_APP is never batched.
- **Email retries:** 3 attempts (immediate, 1 min, 10 min), then FAILED. It then appears in the Admin Ops page with a retry button.

### 14.4 Event catalog (by track)

Key: R = requester, O = official, S = assigned support staff, A = appt admin, Rc = reception, Sec = security, As = task assignee. Email is sent to external guests for every requester-facing event.

| Track | Event                                                                     | Recipients                               | Channels                  | Mandatory |
| ----- | ------------------------------------------------------------------------- | ---------------------------------------- | ------------------------- | --------- |
| T1    | `UserInvited` / `RoleChanged`                                             | the user                                 | IN_APP, EMAIL             | ✓         |
| T1    | `SupportStaffAssigned` / `Removed`                                        | staff member, official                   | IN_APP, EMAIL             | ✓         |
| T1    | `ExportReady`                                                             | requester of the export                  | IN_APP                    | ✓         |
| T2    | `CalendarEventCreated/Updated/Cancelled` by someone else on your calendar | O (if staff made it), S (if O made it)   | IN_APP                    |           |
| T2    | `PersonalAccessGranted/Revoked`                                           | staff member                             | IN_APP                    | ✓         |
| T3    | `AppointmentSubmitted`                                                    | R (confirmation), S (new request)        | IN_APP, EMAIL             | ✓         |
| T3    | `AppointmentAutoRejected`                                                 | R                                        | IN_APP, EMAIL             | ✓         |
| T4    | `AppointmentAssigned`                                                     | assignee                                 | IN_APP, EMAIL             | ✓         |
| T4    | `InfoRequested` / `InfoProvided`                                          | R / assignee                             | IN_APP, EMAIL             | ✓         |
| T4    | `TimesProposed`                                                           | R                                        | IN_APP, EMAIL             | ✓         |
| T4    | `ProposalAccepted` / `Declined`                                           | S                                        | IN_APP                    | ✓         |
| T4    | `ApprovalRequested`                                                       | O (+ other required officials' S)        | IN_APP, EMAIL             | ✓         |
| T4    | `AppointmentConfirmed`                                                    | R, O, S, attendees (email + .ics)        | IN_APP, EMAIL             | ✓         |
| T4    | `AppointmentRejected`                                                     | R, S                                     | IN_APP, EMAIL             | ✓         |
| T4    | `PriorityChanged`                                                         | R, S                                     | IN_APP                    |           |
| T4    | `HoldExpiring` (2h before) / `HoldExpired`                                | S                                        | IN_APP                    |           |
| T4    | `SlaReminder` (50%) / `SlaEscalated` (100%)                               | assignee / next in chain + A             | IN_APP, EMAIL             | ✓         |
| T4    | `UrgentRequest`                                                           | all S + O                                | IN_APP (toast), EMAIL     | ✓         |
| T5    | `ChangeRequested`                                                         | S                                        | IN_APP, EMAIL             | ✓         |
| T5    | `AppointmentRescheduled`                                                  | R, O, S, attendees, Rc (if same day)     | IN_APP, EMAIL             | ✓         |
| T5    | `AppointmentCancelled`                                                    | R, O, S, attendees, Rc/Sec (if same day) | IN_APP, EMAIL             | ✓         |
| T5    | `CapacityWarning`                                                         | S                                        | IN_APP                    |           |
| T6    | `TaskAssigned` / `Reassigned`                                             | As                                       | IN_APP, EMAIL             | ✓         |
| T6    | `TaskCompleted` (delegated)                                               | O (owner)                                | IN_APP                    | ✓         |
| T6    | `TaskVerificationNeeded`                                                  | O                                        | IN_APP                    |           |
| T6    | `TaskReminder`                                                            | As (or O)                                | IN_APP (+EMAIL if chosen) |           |
| T6    | `TaskOverdue` (once, at due+0)                                            | As, O                                    | IN_APP                    |           |
| T6    | `TaskCommented`                                                           | watchers, As, O                          | IN_APP                    |           |
| T7    | `VisitorArrived`                                                          | S, O                                     | IN_APP (toast)            | ✓         |
| T7    | `VisitorCheckedIn` / `WaitingLong` (> 15 min)                             | S                                        | IN_APP                    |           |
| T7    | `VisitorDenied`                                                           | S, A                                     | IN_APP, EMAIL             | ✓         |
| T7    | `AppointmentNoShow`                                                       | S, R                                     | IN_APP, EMAIL             | ✓         |
| T7    | `MeetingReminder` (24h, 2h, 15 min)                                       | R, O, S                                  | IN_APP (+EMAIL at 24h)    |           |
| T8    | `NotesSharedWithYou` / `ActionItemAssigned`                               | owner                                    | IN_APP, EMAIL             |           |
| T9    | `DelegationStarted` / `Ended`                                             | delegate, official                       | IN_APP, EMAIL             | ✓         |
| T11   | `CalendarSyncMismatch` / `SyncFailed`                                     | S, A                                     | IN_APP                    | ✓         |

**Notification content never includes:**

- personal-calendar titles;
- confidential subjects (use "Confidential appointment");
- OTPs (except in the OTP email itself);
- ID numbers.

---

## 15. Visitors & Reception

### 15.1 Flow

- When an appointment is CONFIRMED, one `visit` is created per external attendee, with status EXPECTED.
- Each visitor gets a confirmation email with:
  - date/time, host title, building/floor, entry gate, parking info, what to bring;
  - a **QR code**. The QR holds an opaque random token; only its hash is stored. It contains no personal data.
- Optional pre-registration link: the visitor adds their vehicle number and ID type + last 4 digits.

### 15.2 Visit state machine

```text
EXPECTED ──arrive (QR scan / search)──▶ ARRIVED ──verify & check in──▶ CHECKED_IN ──host accepts──▶ WITH_HOST
WITH_HOST ──check out──▶ CHECKED_OUT
EXPECTED ──(job) grace passed──▶ NO_SHOW
ARRIVED ──deny(reason)──▶ DENIED
EXPECTED / ARRIVED ──appointment cancelled──▶ CANCELLED
```

- The first visit to reach CHECKED_IN moves the appointment to CHECKED_IN.
- Appointment COMPLETED → a reminder to check out any visitors still WITH_HOST. At 20:00 the job auto-checks-out any that remain and flags them.

### 15.3 Reception screen (`/app/reception`)

- Big search box (name / reference / phone) plus a QR scanner (camera, using the browser `BarcodeDetector` API; fall back to manual entry).
- **Columns:** Expected (next 2h) · Arrived · Waiting (with a live wait timer) · With host · Checked out.
- **Actions:**
  - Mark arrived
  - Verify ID (ID type + last 4 only)
  - Check in (assigns a badge number)
  - Print badge (browser print of a badge layout)
  - Notify host again
  - Deny (reason)
  - Check out
- **Walk-in (no appointment):** "Walk-in" button → minimal form: name, phone, whom to meet, purpose. This creates an appointment in UNDER_REVIEW with priority MEDIUM, `source = WALK_IN`, and immediately notifies the host's support staff with a toast. The visitor waits in "Arrived" until staff confirm or reject.
- **Offline fallback:** a "Print today's expected list" button renders a PDF of the day's visitors. Reception prints it every morning.

### 15.4 Security screen (`/app/security`)

- The same data, read-only, plus check-in/out and deny.
- **Emergency list:** everyone currently CHECKED_IN or WITH_HOST, grouped by building/floor, with host and entry time. There is a one-click PDF.

---

## 16. Meeting Day & Follow-up

**Official "Today" dashboard:**

- a timeline of today's items, each with a status chip: Upcoming / Visitor waiting / Checked in / In progress / Done / No-show;
- the next meeting card with a countdown, a briefing (purpose, attendees, attachments) and a "Start meeting" button;
- the To-Do widget (§12.3);
- the capacity bar.

**PA/EA "Today":** the same, for all their officials, plus a waiting-visitors panel.

**During and after the meeting:**

- **Complete meeting** asks for:
  - notes (markdown),
  - decisions,
  - action items (title, owner, due),
  - "Schedule follow-up appointment" (pre-fills a new request).
- Notes visibility inherits from the appointment. Only O, S and the note author can read notes.
- Action items: a list on the appointment. Each can be converted to a To-Do task (§12.5).

---

## 17. Security, Privacy & Compliance

### 17.1 Authentication

- **Staff (SSO)** — Microsoft Entra via OIDC:
  - `openid-client`, authorization code + PKCE, `state` + `nonce`;
  - users are matched by Entra `oid`; the first login creates them only if the email domain is allow-listed;
  - roles are assigned in OAMS by an admin (Entra group mapping is optional, later);
  - MFA is enforced by the Entra conditional access policy. This is documented in the deployment guide.
- **Guests** — email OTP:
  - 6-digit code, bcrypt-hashed, valid 10 minutes, max 5 attempts, max 3 sends per 15 minutes per email and per IP;
  - the account is created with role GUEST;
  - SMS OTP is added in Track 11 (DLT).
- **Break-glass** — LOCAL SUPER_ADMIN:
  - bcrypt cost 12 + TOTP;
  - disabled by default, enabled by an environment variable;
  - every login raises an audit event and an email to all SUPER_ADMINs.

**Tokens:**

- The access JWT uses RS256, lives 15 minutes and is kept **in memory** on the client. Claims: `sub`, `org`, `roles`, `ver`.
- The refresh token is random, 7 days (guests: 1 day), in an `httpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth`. It rotates on every use.
- Reuse of an old refresh token revokes its whole family.
- Keys are loaded from environment/secret files, and key rotation is supported via `kid`.
- CSRF: the refresh and logout endpoints also require the header `X-Requested-With: oams`.
- Deactivating a user revokes all their refresh tokens immediately and bumps `ver`, so outstanding access tokens are rejected.

### 17.2 Authorization

- The `requireAuth` middleware verifies the JWT.
- `can(user, permission, record?)` resolves the scope (§6).
- Repositories take a `ctx` argument ({user, scopes}) and apply the scope WHERE clauses.
- An unauthorized read of a specific record returns **404**, not 403, so the response doesn't leak that the record exists.

### 17.3 HTTP & input hardening

- `helmet` with a strict CSP; `cors` limited to the web origin only.
- Body limit 1 MB (uploads go separately through multer, 10 MB).
- Every route parses its input with Zod. There is no unvalidated `req.body` access.
- Rate limits (Redis-backed):

| Endpoint group  | Limit                |
| --------------- | -------------------- |
| Login / OTP     | 10 per 15 min per IP |
| Public requests | 20 per hour per user |
| Slot search     | 60 per min per user  |
| General API     | 300 per min per user |

- **Uploads:**
  - `file-type` sniffing, with the extension checked against the sniffed type;
  - files stored outside the web root (local disk or S3-compatible), named by UUID;
  - `scan_status` is set by an optional ClamAV job, or `SKIPPED`;
  - downloads go through an authorized endpoint and are audited for CONFIDENTIAL records.

### 17.4 Audit

- Every state change, permission change, override, export, confidential-record view and login is audited.
- `changes` holds `{field: [old, new]}`. **For PERSONAL events, PERSONAL tasks and CONFIDENTIAL subjects/notes, only field names are stored, never the values.**
- **Hash chain:** `hash = sha256(prev_hash || canonical_json(row_without_hash))`. The nightly job `audit-verify` recomputes the chain and alerts SUPER_ADMIN if it breaks.
- The DB user for the app has only INSERT/SELECT on `audit_events` (no UPDATE/DELETE grant).
- `correlation_id` comes from the `X-Request-Id` header (or is generated). It is propagated into jobs and outbox events.

### 17.5 Logging

- `pino` JSON logs with `correlation_id`, user ID and route. Redact: authorization headers, cookies, `password`, `otp`, `code`, `token`, `id_last4`.
- Logs are retained **≥ 180 days** (CERT-In).

### 17.6 India compliance (DPDP Act 2023 & others)

- **Notice + consent** at request submission and first guest login. The notice covers: what is collected, the purpose (scheduling & visitor security), the retention period, rights, and the grievance officer's contact. It is versioned, and stored in `consents` with the notice version.
- **Data principal rights:** an admin screen to export, correct or erase a person's data. Erasure anonymizes the requester snapshot and visits, but keeps the audit row IDs.
- **Aadhaar and government IDs:** **never store full numbers or images by default.** Store the ID type + last 4 digits only. If a document image is legally required, it is behind a settings flag, with encrypted storage and a 30-day auto-purge.
- **Retention defaults** (the `data-retention` job runs nightly; all values configurable):

| Data            | Retention        |
| --------------- | ---------------- |
| Visitor records | 1 year           |
| Appointments    | 3 years          |
| Notifications   | 90 days          |
| OTP rows        | 24h              |
| Audit           | 7 years          |
| Logs            | 180 days minimum |

- **Incident response:** the runbook covers the **6-hour CERT-In reporting** requirement and DPDP breach notification.
- **SMS (Track 11):** the sender ID and every template must be registered on the **TRAI DLT** portal before go-live. The template IDs are stored in `notification_templates`.
- **WhatsApp** is out of scope for v2 (it needs Meta template approval).

---

## 18. API Surface (v1)

All routes are prefixed `/api/v1`. Every route validates with Zod and checks permissions. Mutations accept `Idempotency-Key`.

```http
# auth
GET  /auth/microsoft/start          GET  /auth/microsoft/callback
POST /auth/otp/request              POST /auth/otp/verify
POST /auth/refresh                  POST /auth/logout          GET /auth/me

# users & admin
GET/POST /users     PATCH /users/:id     POST /users/:id/disable
GET /roles          PUT /users/:id/roles
GET/POST /departments    GET/POST/PATCH /holidays    GET/PUT /settings

# officials
GET/POST /officials               GET/PATCH /officials/:id
GET/POST/PATCH/DELETE /officials/:id/support-staff
GET/POST /officials/:id/delegations          POST /delegations/:id/revoke
GET/PUT /officials/:id/availability-rules    GET/POST/DELETE /officials/:id/availability-exceptions
GET/PUT /officials/:id/protected-blocks      GET/PUT /officials/:id/capacity-policy

# calendar
GET  /calendar/events?officialIds=&from=&to=&layers=ORG,PERSONAL,TASKS
POST /calendar/events        PATCH /calendar/events/:id     POST /calendar/events/:id/cancel
GET  /calendar/control-room?officialIds=&date=

# scheduling
POST /scheduling/check       POST /scheduling/slots

# appointments
GET  /appointments?status=&officialId=&priority=&from=&to=&q=&assignedToMe=
POST /appointments                     (create DRAFT)
GET/PATCH /appointments/:id            (PATCH only while DRAFT)
POST /appointments/:id/submit
POST /appointments/:id/request-info    POST /appointments/:id/respond-info
POST /appointments/:id/propose-times   POST /appointments/:id/accept-proposal
POST /appointments/:id/decline-proposals
POST /appointments/:id/schedule        POST /appointments/:id/approve
POST /appointments/:id/reject          POST /appointments/:id/suggest-other
POST /appointments/:id/priority        POST /appointments/:id/cancel
POST /appointments/:id/start           POST /appointments/:id/complete
POST /appointments/:id/close
GET  /appointments/:id/history         GET  /appointments/:id/ics
POST /appointments/:id/change-requests    POST /change-requests/:id/(propose|accept|reject|withdraw)
POST /appointments/:id/reschedule      (staff direct move)
POST /appointments/:id/attachments     GET /attachments/:id/download

# rooms
GET/POST/PATCH /rooms        GET /rooms/:id/availability?from=&to=

# visits
GET  /visits?date=&status=   GET /visits/:id    POST /visits/lookup  {qrToken | query}
POST /visits/:id/(arrive|check-in|with-host|check-out|deny)
POST /visits/walk-in         GET /visits/emergency-list    GET /visits/today.pdf

# meetings
GET/PUT /appointments/:id/notes
GET/POST /appointments/:id/action-items   PATCH /action-items/:id
POST /action-items/:id/convert-to-task

# tasks
GET  /tasks?officialId=&view=list|board&status=&priority=&category=&due=&assignee=&source=&q=&cursor=
POST /tasks   GET/PATCH /tasks/:id
POST /tasks/:id/(start|block|unblock|complete|verify|cancel|reopen|assign)
POST /tasks/reorder          POST /tasks/bulk      {ids, action, payload}
GET/POST /tasks/:id/comments      GET/POST/DELETE /tasks/:id/checklist
GET/POST/DELETE /tasks/:id/reminders    POST /tasks/:id/attachments
GET  /tasks/summary?officialId=          (widget counts)
POST /tasks/export  {format, filter}  → file or {jobId}

# notifications (see §14.2)

# reports & audit
GET /reports/overview?from=&to=&officialId=
GET /reports/appointments.xlsx?…
GET /audit?entityType=&entityId=&actorId=&from=&to=
GET /admin/ops   (failed jobs, failed emails, stuck appointments, sync errors)
```

---

## 19. Frontend

### 19.1 Route map

```text
/login                          SSO button + "I'm a visitor" (email OTP)
/auth/callback
/request                        wizard (§9)
/my/appointments                requester list      /my/appointments/:id   status page
/app/dashboard                  role-aware home (Official Today / PA Today / Reception / Admin)
/app/inbox                      PA/EA review queue (sorted by SLA due, priority)
/app/appointments               list + filters      /app/appointments/:id  detail (tabs: Overview,
                                                    Scheduling, Attendees, Files, Notes, History)
/app/calendar                   §8.2                /app/control-room      §8.3
/app/find-slot                  standalone slot finder
/app/todo                       §12.3 (?view=list|board|calendar)   /app/todo/:id (drawer route)
/app/reception                  §15.3               /app/security          §15.4
/app/notifications              full notification center
/app/settings                   profile, theme, notification preferences, quiet hours, digest
/app/settings/personal-access   (official) grant/revoke PA access to personal calendar
/admin/users   /admin/officials   /admin/officials/:id   /admin/rooms   /admin/holidays
/admin/settings   /admin/audit   /admin/ops   /admin/reports   /admin/privacy-requests
```

The nav is built from permissions. A user never sees a link they can't use, and every route also has a `PermissionGate`.

### 19.2 Theme & design tokens (Tailwind 4)

- Tokens are defined in `styles/theme.css` with `@theme`: colours, radii, spacing, shadows, fonts. Light and dark themes are switched by `[data-theme]` on `<html>`, and `SYSTEM` follows `prefers-color-scheme`.
- The theme choice is stored in `users.theme` and applied before first paint via a tiny inline script. That script reads the choice from a non-sensitive cookie so the page doesn't flash the wrong theme.
- Semantic colours:
  - **Priority:** low = slate, medium = blue, high = orange, urgent = red.
  - **Status:** review = amber, confirmed = green, terminal = grey, rejected = red.
  - **Calendars:** ORG = brand blue, PERSONAL = violet, HOLD = amber stripes, SOFT block = dashed.
- Never use colour alone to carry meaning: priority also gets a flag icon + label, and status gets text.

### 19.3 Custom component library (`components/ui`) — accessibility is our job

Because we don't use Radix, each component must implement its own keyboard handling and ARIA. Each has a test for keyboard interaction.

| Component                                                                                     | Must implement                                                                           |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Button, IconButton                                                                            | `aria-label` for icon-only, loading state with `aria-busy`                               |
| Input, Textarea, Select (native), Checkbox, Switch                                            | label association, `aria-invalid`, error text via `aria-describedby`                     |
| RadioCardGroup (priority picker)                                                              | `role=radiogroup`, arrow-key roving tabindex                                             |
| Combobox (official/user search)                                                               | ARIA 1.2 combobox pattern, listbox, active-descendant, typeahead                         |
| DatePicker, TimePicker, DurationSelect                                                        | grid keyboard nav (arrows, PgUp/PgDn, Home/End), typed input fallback                    |
| Dialog, Drawer, ConfirmDialog                                                                 | focus trap, restore focus on close, `aria-modal`, scroll lock                            |
| Popover, Menu, Tooltip                                                                        | outside click/Esc closes, Menu uses roving focus                                         |
| Tabs                                                                                          | `role=tablist`, arrow keys                                                               |
| Toast                                                                                         | `aria-live=polite` (URGENT: `assertive`)                                                 |
| DataTable, Pagination                                                                         | sortable headers with `aria-sort`, row selection with checkboxes                         |
| Stepper, Timeline, StatusBadge, PriorityBadge, Avatar, Card, Skeleton, EmptyState, ErrorState | —                                                                                        |
| FileUpload                                                                                    | drag-drop + button fallback, per-file progress + error                                   |
| CalendarGrid (day/week/month)                                                                 | keyboard focus per slot/event, drag with keyboard alternative ("Move" dialog)            |
| KanbanBoard                                                                                   | drag-drop + keyboard move (Space to pick, arrows, Space to drop) with live announcements |
| NotificationBell                                                                              | badge count announced, popover list                                                      |
| PermissionGate                                                                                | renders children only if `can()` is true                                                 |

Every data component supports these states: loading, empty, error, and permission-denied. Every screen must work at 360px width. Admin configuration screens may be desktop-first.

The accessibility target is WCAG 2.2 AA.

### 19.4 Data layer

- `lib/api.ts` is a fetch wrapper. It attaches the access token, auto-refreshes once on 401, parses the envelope and throws a typed `ApiError`.
- Query keys: `['appointments', filters]`, `['appointment', id]`, `['calendar', officialId, range, layers]`, `['tasks', officialId, filters]`, `['tasks-summary', officialId]`, `['notifications']`, `['unread-count']`.
- `useNotificationStream()` hook: opens the SSE connection, updates the unread count, shows toasts, and invalidates keys using the §14.2 map.
- Use optimistic updates for task complete, reorder and board drag, with rollback on error.

---

## 20. Background Jobs (BullMQ)

| Queue / job             | Schedule               | Purpose                                             |
| ----------------------- | ---------------------- | --------------------------------------------------- |
| outbox-dispatch         | every 1s               | Route outbox events to handlers                     |
| email-send              | on demand              | Nodemailer send with retries                        |
| hold-expiry             | every 1 min            | Expire holds and proposals (§10.7)                  |
| sla-escalation          | every 5 min            | 50% reminders, 100% escalations                     |
| reroute-assignments     | every 15 min           | Delegation start/end, staff leave                   |
| meeting-reminders       | every 1 min            | 24h / 2h / 15 min reminders                         |
| noshow-detect           | every 5 min            | CONFIRMED → NO_SHOW after grace period              |
| info-request-expiry     | hourly                 | INFO_REQUESTED → EXPIRED                            |
| auto-close              | daily 01:00            | COMPLETED + 14 days → CLOSED                        |
| visitor-auto-checkout   | daily 20:00            | Flag and check out leftover visitors                |
| task-reminders          | every 1 min            | Send due task reminders                             |
| task-overdue            | every 15 min           | One-time overdue notification                       |
| recurring-task-generate | daily 00:15            | Next occurrences up to 14 days ahead                |
| recurring-event-expand  | daily 00:30            | Materialize recurring calendar events 90 days ahead |
| exports                 | on demand              | Large CSV/XLSX/PDF                                  |
| daily-digest            | daily 08:00            | Digest emails                                       |
| data-retention          | daily 02:00            | Purge/anonymize per §17.6                           |
| audit-verify            | daily 03:00            | Hash-chain check                                    |
| calendar-sync (T11)     | every 5 min + webhooks | Outlook sync                                        |

All jobs:

- are **idempotent**;
- carry the `correlation_id`;
- record failures;
- surface in `/admin/ops` after their final failed attempt.

---

## 21. Testing Strategy

- **API:**
  - Vitest + Supertest against a real Postgres 16 and Redis 7 (docker compose or testcontainers);
  - migrations run once per test run; each test runs in a transaction that is rolled back, or on a truncated schema;
  - factories live in `test/factories`.
- **Web:** Vitest + Testing Library + msw. Every custom UI component has a keyboard test.
- **Required in every track:**
  - Every state-machine row (§10.2, §12.2, §15.2): one allowed-path test plus one wrong-state test (expect 409) plus one wrong-role test (expect 403/404).
  - Scope tests: PA of official A cannot read official B's appointments, calendar or tasks (expect 404).
  - Privacy tests:
    - personal calendar titles never appear in responses to PA without the grant, in admin views, reports, exports, notifications or audit rows;
    - personal tasks: the same.
  - Notification tests: each event in §14.4 for the track creates the right `notifications` rows for the right recipients, and no duplicate on retry.
- **Critical tests:**
  - 20 parallel confirms for the same slot → exactly 1 succeeds.
  - Reschedule failure keeps the old booking intact.
  - Hold expiry releases the slot.
  - A delegation that ends mid-review re-routes the appointment.
  - Midnight-crossing and all-day events.
  - Timezone display for a user in another timezone.
  - Duplicate idempotent POST returns the same response.
- Coverage goal: services ≥ 80%, the state machine and scheduling engine 100% of branches.

---

## 22. Build Tracks (the order to vibe-code)

Every track follows the same template. **Scope → Migrations → API → Screens → In-app notifications → Tests → Done when.**

**Prompt template to give your AI for each track:**

> Read `docs/OAMS_VibeCoding_Master_Spec_v2.md` sections 0, 4, 5 and the sections listed for **Track N**. Implement Track N only. First show me a short plan: files, migrations and endpoints. Wait for my OK. Then implement it with tests. Finish by running `pnpm typecheck && pnpm test` and listing each "Done when" item with ✅/❌.

---

### Track 0 — Project setup

**Sections:** §3, §4

- Scope:
  - pnpm monorepo;
  - `apps/api` Express skeleton, `apps/web` Vite skeleton, `packages/shared`;
  - ESLint + Prettier, `tsconfig` strict;
  - docker-compose (Postgres 16, Redis 7, MailHog for dev email);
  - `.env.example`;
  - Knex config + first empty migration;
  - pino + request-id middleware, error handler + envelope, `/health`;
  - web shell with router, theme tokens (light/dark toggle), placeholder layout;
  - CI script: lint, typecheck, test.
- **Done when:** `docker compose up` + `pnpm dev` runs both apps; `/health` returns ok and checks the DB and Redis; the theme toggle works; CI passes.

### Track 1 — Foundation: auth, users, roles, officials, audit, **in-app notifications**, email

**Sections:** §5, §6, §7.1, §7.2, §7.7, §14.1–14.3, §17

- Migrations: identity tables, departments, officials, support staff, `calendars` (with an auto-create trigger/service), notifications, deliveries, preferences, templates, outbox, audit, reference counters, settings.
- API:
  - auth (Microsoft OIDC, email OTP, refresh/logout/me, break-glass);
  - users/roles admin;
  - officials + support staff admin;
  - notifications endpoints + SSE;
  - preferences.
- Core:
  - `can()` + scope helpers;
  - audit writer with hash chain;
  - outbox writer + `outbox-dispatch` worker;
  - notification router;
  - email via Nodemailer + templates;
  - `email-send` queue.
- Screens:
  - login, callback;
  - app shell with **NotificationBell** + toast;
  - `/app/notifications`;
  - `/app/settings` (theme, notification preferences, quiet hours, digest);
  - `/admin/users`, `/admin/officials`, `/admin/officials/:id` (Support staff tab).
- Seeds: 1 org, roles and permissions per §6.3, demo officials (CEO, CFO, COO) each with a PA/EA, a reception user, an auditor.
- In-app events: T1 rows in §14.4.
- **Done when:**
  - SSO and OTP login work;
  - a role-gated nav renders;
  - assigning a PA to the CEO shows up **live in the PA's bell** within 2s, plus an email in MailHog;
  - audit rows chain correctly;
  - scope tests pass.

### Track 2 — Calendars (Org + Personal), availability, holidays

**Sections:** §7.3, §8.1–8.3, §11.2 (read-only use), §13

- Migrations: calendar_events (with the exclusion constraint), availability rules/exceptions, protected blocks, holidays, rooms, room_bookings, capacity policies.
- API: calendar events CRUD with layer filtering and visibility masking; availability admin; holidays; rooms; control room; `/scheduling/check`.
- Screens:
  - `/app/calendar` (day/week/month/agenda, Org/Personal layer toggles, create/edit dialog with the calendar-type choice, recurrence edit scopes);
  - `/app/control-room`;
  - `/app/settings/personal-access`;
  - admin tabs for availability, protected time, capacity, holidays, rooms.
- In-app events: T2 rows.
- **Done when:**
  - the official sees full personal events;
  - a PA without the grant sees grey "Busy" only (verified by an API response test, not just the UI);
  - overlapping HARD events are rejected by the DB constraint;
  - `/scheduling/check` returns correct conflict codes for every row of §11.2.

### Track 3 — Appointment request & tracking

**Sections:** §7.5, §9, §10.1, §10.4

- API: create/patch draft, submit (auto-checks, reference number, routing, SLA), requester list/detail, attachments, .ics.
- Screens: `/request` wizard with the priority radio cards, `/my/appointments`, `/my/appointments/:id` status tracker.
- In-app events: T3 rows.
- **Done when:**
  - a guest can sign in with OTP, submit, and see the reference number;
  - HIGH priority without a reason is blocked;
  - the duplicate rule works;
  - the PA gets a live bell notification + email;
  - consent is stored with the notice version.

### Track 4 — Review, routing, scheduling engine, holds, approval

**Sections:** §10.2–10.5, §10.7, §11, §14.4 (T4)

- API: every review/approval transition, `/scheduling/slots`, priority change, SLA escalation job, hold-expiry job, reroute job.
- Screens:
  - `/app/inbox` (SLA countdown, priority sort, verification checklist);
  - appointment detail Scheduling tab (conflict banner, slot recommendation cards with "Why this slot?", propose up to 3);
  - requester "accept a proposed time" UI;
  - official approval card on the dashboard (approve/reject/suggest other);
  - `/app/find-slot`.
- **Done when:**
  - every §10.2 row has a passing test;
  - the parallel-confirm test passes;
  - holds appear striped on the calendar and expire;
  - URGENT triggers immediate toasts to the official and all support staff;
  - SLA escalation fires at 50%/100%.

### Track 5 — Change requests, rescheduling, cancellation, multi-official, rooms in booking

**Sections:** §10.5 (multi-official), §10.6, §13

- **Done when:**
  - a failed reschedule leaves the old booking intact (test);
  - multi-official approval follows the REQUIRED/OPTIONAL rules;
  - dragging an appointment on the calendar opens the reschedule flow;
  - cancelling releases the event, room and visits;
  - T5 notifications work.

### Track 6 — To-Do module

**Sections:** §7.6 (tasks), §12, §14.4 (T6)

- API: tasks CRUD, lifecycle actions, reorder, bulk, checklist, comments, reminders, attachments, summary, export (sync + job).
- Screens: `/app/todo` with List/Board/Calendar views, quick-add, filters, detail drawer, dashboard widget, calendar "Tasks" layer, export menu.
- Jobs: task-reminders, task-overdue, recurring-task-generate, exports.
- **Done when:**
  - PERSONAL tasks are invisible to the PA in API, export and audit (tests);
  - delegated completion notifies the official live;
  - overdue is derived correctly;
  - recurring tasks generate occurrences;
  - XLSX/PDF/CSV exports open correctly and are audited.

### Track 7 — Visitors, reception, security, meeting day

**Sections:** §15, §16 (dashboards), §14.4 (T7)

- **Done when:**
  - a QR scan checks a visitor in and the host's PA gets a toast;
  - the waiting timer is live;
  - walk-ins create a review item;
  - the no-show job works;
  - the emergency list PDF works;
  - the printable daily list works;
  - reception never sees subject or purpose (test).

### Track 8 — Meeting notes, action items, follow-up

**Sections:** §16, §12.5

- **Done when:**
  - completing a meeting captures notes and actions;
  - convert-to-task links both ways;
  - completing the task closes the action item;
  - the follow-up appointment is pre-filled;
  - auto-close works.

### Track 9 — Delegation, escalation polish, reminders, digest

**Sections:** §7.2 delegations, §10.3, §14.3, §20

- **Done when:**
  - delegation windows reroute automatically at start and end;
  - quiet hours hold emails;
  - the digest batches correctly;
  - the official can grant/revoke personal-calendar and task access with immediate effect.

### Track 10 — Reports, search, audit viewer, admin ops, privacy requests

**Sections:** §17.4, §17.6, §18 reports/audit

- Reports:
  - volume by official/status/priority;
  - average time submit→confirm;
  - no-show and cancellation rates;
  - room utilization;
  - SLA breach count.

  Every KPI shows its formula and date range. Personal and confidential content is excluded.

- **Done when:** the reports match the fixture data exactly (tests); the audit viewer filters and verifies the chain; `/admin/ops` can retry failed emails and jobs; the privacy export/erase flow works.

### Track 11 — Integrations: Outlook calendar, Teams links, SMS

**Sections:** §8.4, §17.6 (DLT)

- Microsoft Graph calendar sync per §8.4; auto-create a Teams meeting link on confirm for ONLINE appointments; SMS provider with DLT template IDs for confirm, reminder and OTP.
- **Done when:**
  - sync is idempotent;
  - an external edit raises a mismatch notification;
  - a provider outage never blocks confirmation (sync status goes PENDING, then is retried).

### Track 12 — Hardening & launch

- Load test (slot engine p95 < 1.5s; API p95 < 500ms at the expected load, see §24), accessibility audit, security review (OWASP ASVS L2 checklist), backup and restore drill, runbooks (incident/CERT-In, restore, key rotation), UAT sign-off.

---

## 23. Definition of Done (every feature)

- [ ] Behaviour matches this spec; any deviation is recorded in §24 and approved.
- [ ] Zod schemas in `packages/shared`; no duplicated types.
- [ ] Permission + scope enforced in the repo query and tested (including the 404-for-unauthorized case).
- [ ] State changes go through the service with audit + outbox in one transaction.
- [ ] In-app notifications for the track's §14.4 events are delivered live, deduped, and respect preferences.
- [ ] Loading, empty, error and permission-denied UI states exist; works at 360px width; keyboard accessible.
- [ ] No personal or confidential leakage (tests).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass.
- [ ] Migrations are forward-only and reversible (`down`) where safe.
- [ ] Docs updated (API notes + any new settings keys).

---

## 24. Open Questions (defaults chosen — change if needed)

| #   | Question                                                                      | Default used in this spec                                                                               |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Q1  | Expected scale: how many officials, appointments/day and concurrent users?    | ≤ 50 officials, ≤ 500 appointments/day, ≤ 300 concurrent users. Single VM + managed Postgres is enough. |
| Q2  | Hosting: on-prem or cloud (Azure / AWS India region)?                         | Cloud, India region (data residency).                                                                   |
| Q3  | Guest OTP channel                                                             | Email first; SMS in Track 11.                                                                           |
| Q4  | Retention periods                                                             | §17.6 defaults                                                                                          |
| Q5  | Allowed staff email domains for SSO                                           | Set in `settings.sso_allowed_domains`                                                                   |
| Q6  | Is ID verification at reception mandatory?                                    | Optional per official (`officials.require_id_check`)                                                    |
| Q7  | Can staff move a confirmed appointment without the requester's re-acceptance? | Yes, if ≥ 24h away and the requester accepted this in the notice.                                       |
| Q8  | Working hours for SLA clock                                                   | Mon–Fri 09:30–18:30 IST, minus holidays                                                                 |
| Q9  | Grievance officer name/contact for the DPDP notice                            | To be provided                                                                                          |

---

## 25. Out of Scope for v2 (future)

- Multi-tenant SaaS, plans, subscriptions, billing, feature entitlements
- AI / natural-language booking, smart auto-rescheduling
- CRM / ERP integration
- WhatsApp messaging
- Native mobile apps (the web app is responsive and installable as a PWA later)
- Waitlist (requesters can decline proposals and be re-proposed instead)
- Zoom / Google Meet (Teams only in Track 11)

The data model already carries `org_id` and the outbox/event design, so these can be added without rewrites.

---

## Appendix A — What changed from v1 (deficiency → fix)

| v1 problem                                                                                                     | Fixed in                                                                 |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Two conflicting appointment state machines; DECLINED vs REJECTED                                               | §5, §10.1–10.2 (one machine, one enum)                                   |
| Transition gaps (INFO_REQUIRED dead end, EXPIRED unreachable, can't cancel early, terminal states never close) | §10.2, terminal set in §5                                                |
| Visitor lifecycle defined twice, differently; no link to appointment state                                     | §15.2                                                                    |
| Three different roadmaps; audit scheduled "later" but required on every transition                             | §22 (one track order); audit, outbox and in-app notifications in Track 1 |
| Three permission syntaxes; roles ≠ actors                                                                      | §6                                                                       |
| Priority and availability enums inconsistent                                                                   | §5                                                                       |
| "Verification" undefined                                                                                       | §10.4                                                                    |
| No slot hold between request and approval                                                                      | §10.7, §11.4                                                             |
| No state for "waiting on requester" / proposal expiry                                                          | AWAITING_REQUESTER, §10.2                                                |
| Approval authority vague; multi-official conflicting decisions undefined                                       | §10.5                                                                    |
| Requester could self-set "Critical"                                                                            | §9 Step 2 (LOW/MEDIUM/HIGH; URGENT staff-only; HIGH needs a reason)      |
| Rescheduling as a state caused state explosion                                                                 | §10.6 change requests                                                    |
| No concrete double-booking protection                                                                          | Exclusion constraint §7.3, test §11.4                                    |
| Personal vs org time not modelled                                                                              | §8 (two calendars per official, visibility matrix)                       |
| To-Do: OVERDUE stored as status, REOPENED/BACKLOG inconsistent, no private tasks                               | §12                                                                      |
| Notifications had no delivery design, dedupe, quiet hours or digest                                            | §14                                                                      |
| Audit "append-only" only by convention                                                                         | §17.4 hash chain + DB grants                                             |
| No India compliance (DPDP, Aadhaar, CERT-In, DLT)                                                              | §17.6                                                                    |
| Walk-ins, meeting-day offline fallback, visitor special needs missing                                          | §15.3, attendee `needs`                                                  |
| No numbers for scale/SLA                                                                                       | §9 SLA table, §24 defaults                                               |
| Scope creep (billing, SaaS, AI mixed into MVP)                                                                 | §25                                                                      |
| Section numbering jump, duplicate screen numbers, broken checklist markdown                                    | Rewritten document                                                       |
