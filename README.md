# OAMS — Official Appointment Management System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-purple.svg)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19.x-61dafb.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-157%20Passed%20(100%25)-brightgreen.svg)]()
[![Typecheck](https://img.shields.io/badge/Typecheck-Passing%20(0%20Errors)-brightgreen.svg)]()

> **Enterprise Dignitary Scheduling, Secretariat Triage, Protocol Management, and Digital Visitor Access Architecture**  
> Designed for university leadership, government chancellery, and high-security executive secretariats.

---

## 🏛️ Executive System Overview

**OAMS (Official Appointment Management System)** is an enterprise monorepo platform designed to streamline, secure, and modernize official appointment scheduling for senior institutional leadership. It coordinates high-stakes meetings across executive chambers, secretariats, reception security gates, and public citizens with strict Role-Based Access Control (RBAC), Service Level Agreement (SLA) enforcement, and biometric/QR security protocols.

### Key Differentiators & Innovative Features
- **Secretariat Triage Inbox**: High-density triage console with SLA due-time tracking, urgent priority filtering, inline Fast-Track approvals, and structured decline notes.
- **Smart Slot Recommendation Engine**: Multi-factor scheduling algorithm evaluating official calendar blocks, buffer margins, room capacities, and preferred windows to generate conflict-free candidate slots.
- **Digital Visitor Gate Pass & QR Code Verification**: Official, printable security gate slip with SVG 2D QR matrix verification, RFID badge assignment, and live gate arrival check-in simulation.
- **Context-Aware Milestone Guidance**: Milestone roadmap showing clear immediate next steps, required documents, and secretariat contact protocols for every appointment status.
- **Executive Task Management Console**: Full lifecycle task tracker supporting priority, category classification, due dates, chamber assignments, and multi-format exports (CSV, XLSX, PDF).
- **Dual-Engine Runtime (Zero Demo Downtime)**: Seamlessly operates against a live PostgreSQL/Redis backend OR transparently falls back to an in-memory & localStorage mock engine with realistic data persistence.

---

## 🏗️ Monorepo Architecture

```
OAMS/
├── apps/
│   ├── api/                   # Express, Knex.js, PostgreSQL, Redis, SSE streaming, audit logs
│   │   ├── src/modules/       # Appointments, Visits, Scheduling, Tasks, Users, Notifications
│   │   └── test/              # 35 Vitest suites (141 tests covering RBAC, OWASP, concurrency)
│   └── web/                   # Vite, React 19, Tailwind CSS, Lucide icons, TanStack Query
│       ├── src/features/      # Inbox, Appointments, Calendar, Visits, Tasks, Reports, Settings
│       └── test/              # Vitest & Testing Library suites (16 tests)
├── packages/
│   └── shared/                # Universal TypeScript contracts, Zod schemas, enums, DTOs
└── docs/                      # Master specs, OWASP ASVS L2 checklist, UAT test plans
```

---

## 👥 Demo Personas & Credentials Matrix

OAMS features a **One-Click Persona Switcher** on the top header bar, allowing evaluators to switch roles instantaneously without manual re-login:

| Persona | Role Code | Email | Password | Access & Responsibilities |
|---|---|---|---|---|
| **Mr. KVK** | `OFFICIAL` / `CHAIRMAN` | `kvk@stmarysgroup.com` | `password123` | Executive leadership dashboard, chamber appointments, calendar management |
| **Mr. Harsha Rao** | `OFFICIAL` / `CEO` | `harsha@stmarysgroup.com` | `password123` | Senior executive dashboard, corporate and faculty delegations |
| **Ms. Indhu** | `SECRETARIAT_PA` | `indhu@stmarysgroup.com` | `password123` | Secretariat triage inbox, calendar approvals, candidate slot proposals |
| **Mr. Janardhan** | `SECRETARIAT_PA` | `janardhan@stmarysgroup.com` | `password123` | Scheduling coordination, room allocation, meeting minutes & follow-ups |
| **Security Gate 1** | `SECURITY` | `security@stmarysgroup.com` | `password123` | Visitor gate pass QR scanning, RFID badge issuance, vehicle clearance |
| **Reception Desk** | `RECEPTIONIST` | `reception@stmarysgroup.com` | `password123` | Campus lobby arrivals, waiting queue tracking, host ushering |
| **Dr. Ramesh (Dean)** | `FACULTY` | `ramesh@stmarysgroup.com` | `password123` | Faculty requests, departmental appointments, meeting tracking |
| **Priya Sharma** | `CITIZEN` / `STUDENT` | `priya@example.com` | `password123` | Public appointment wizard, tracking timeline, printable gate pass |
| **Break-Glass Admin** | `SYSTEM_ADMIN` | `admin@stmarysgroup.com` | `password123` | Master registry, audit trails, user RBAC controls, holiday calendars |

---

## ⚡ Quick Start & Running Locally

### Prerequisites
- **Node.js**: v20.x or higher
- **pnpm**: v9.x or higher (`npm install -g pnpm`)

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/ksrividya7670-Kuruva/OAMS.git
cd OAMS

# Install monorepo dependencies
pnpm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` (pre-configured with sensible local defaults):
```bash
cp .env.example .env
```

Key environment parameters:
```env
PORT=3000
VITE_API_URL=http://localhost:3000
DATABASE_URL=postgres://oams:oams_pass@localhost:5432/oams_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=oams-dev-secret-super-secure-key-32chars
NODE_ENV=development
```

### 3. Launching the Application
```bash
# Start frontend web app (Port 5173)
pnpm --filter @oams/web dev

# Start backend API (Port 3000, optional when testing with client mock engine)
pnpm --filter @oams/api dev

# Or start all workspaces concurrently
pnpm dev
```

Navigate to **`http://localhost:5173`** in your browser.

---

## 🧪 Testing & Validation Suite

The project includes automated regression, security, and benchmark test suites:

```bash
# Run all tests across the monorepo (157 tests)
pnpm test

# Typecheck all packages with strict TypeScript compiler
pnpm -r typecheck

# Run web test suite specifically
pnpm --filter @oams/web test

# Run backend API test suite specifically
pnpm --filter @oams/api test
```

### Verified Test Results Summary
- **API Test Files**: 35 passed (141 tests covering RBAC authorization, calendar overlap detection, token validation, audit chaining, load test latency benchmarks)
- **Web Test Files**: 3 passed (16 tests covering deployment readiness, theme toggles, accessibility)
- **TypeScript Compiler (`tsc --noEmit`)**: 0 errors across `@oams/shared`, `@oams/api`, and `@oams/web`

---

## 🎯 Step-by-Step Live Demonstration Script

Follow this script for an impactful internship evaluation presentation:

### Step 1: Public Portal & Citizen Request Wizard
1. Open `http://localhost:5173` and click **"Book Official Appointment"**.
2. Select **Honorable Chairman Mr. KVK** as the official.
3. Select Meeting Mode (**In-Person Executive Chamber**), enter purpose (**Institutional Accreditation Briefing**).
4. In Step 3, choose a preferred date and time window. Notice the **duplicate booking validator** ensures no existing active booking conflicts.
5. Submit the request. Note the generated tracking reference (e.g., `APT-2026-0042`).

### Step 2: Appointment Progress & Clear Next Steps
1. Navigate to the generated tracking page (`/my/appointments/:id`).
2. Observe the **Progress Stepper** indicating **"Submitted"**.
3. View the **Context-Aware Milestone Guidance Card**: Explains that the request is queued in Secretariat Master Registry under official SLA.

### Step 3: Secretariat Triage & Inbox Fast-Track Review
1. Use the **Persona Switcher** in the top navigation bar to switch to **Ms. Indhu (Secretariat PA)**.
2. Click **"Inbox"** (`/app/inbox`).
3. Note the high-density triage strip displaying **Total Queue**, **Urgent Priority**, and **SLA Adherence**.
4. Use the live search to find the newly submitted reference.
5. Click **"Fast-Track Approve"** or propose candidate slots. Status transitions to **CONFIRMED** with scheduled chamber venue.

### Step 4: Digital Visitor Gate Pass & QR Code Verification
1. Switch back to **Priya Sharma (Requester)** or navigate to `/my/appointments/:id`.
2. Observe the updated **"CONFIRMED"** status on the stepper and the **"Access Cleared"** guidance.
3. Inspect the newly rendered **Digital Visitor Gate Pass**:
   - Authorized Visitor & Host Official details.
   - Confirmed Chamber Venue (`Main Secretariat Chambers, Floor 2`).
   - SVG vector 2D QR matrix with verification hash.
4. Click **"Print Pass"**: Demonstrates dedicated clean `@media print` layout previewing physical gate pass slip.
5. Click **"Check-In at Gate 1"** (Security simulator): Immediately verifies campus arrival, transitions status to **CHECKED_IN**, assigns badge `B-104`, and updates the timeline.

### Step 5: Real-Time Notifications & Diagnostics
1. Navigate to **"Settings"** (`/app/settings`).
2. Scroll to **"Real-Time Notification & Workflow Diagnostics"**.
3. Click **"Send Status Update Notification"** or **"Send Gate Arrival Alert"**.
4. Observe the instant bell badge count update and floating popup toast in the top bar.

---

## 🔒 Security & Hardening Features

- **OWASP ASVS L2 Aligned**: Strict Content Security Policy (CSP), anti-sniffing (`X-Content-Type-Options: nosniff`), and frame denial (`X-Frame-Options: SAMEORIGIN`).
- **Role-Based Access Control (RBAC)**: Role gating across `SYSTEM_ADMIN`, `SECRETARIAT_PA`, `OFFICIAL`, `RECEPTIONIST`, `SECURITY`, `FACULTY`, and `CITIZEN`.
- **Zero Exposed Secrets**: Strict separation of client/server code, environment variable protection, and memory sanitized token handling.
- **Audit Logging**: Immutable audit ledger logging every status transition, reschedule proposal, and security clearance action.

---

## 📜 License
Developed for the Official Appointment Management System (OAMS) project evaluation. All rights reserved.
