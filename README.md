# Workforce Face Verification + Geofenced Attendance & RBAC Access System

A production-grade, enterprise workforce identity and access system featuring **1:1 Face Verification**, **Liveness / Anti-Spoof detection**, **Physical Office Geofencing**, and **Granular Role-Based Access Control (RBAC)**.

---

## 1. Architectural Flow

```text
Employee Identity
        ↓
Face Verification (1:1 Cosine Similarity Match against enrolled biometric template)
        ↓
Liveness / Anti-Spoof Challenge
        ↓
Browser Geolocation (Client GPS with Accuracy Validation)
        ↓
Office Geofence Validation (Backend Haversine Distance ≤ Allowed Office Radius)
        ↓
RBAC / Permission Validation (Role → Permission mapping)
        ↓
Attendance / Access Decision (Atomic DB-level protection against concurrent double check-in)
        ↓
Audit Trail & Security Telemetry
```

---

## 2. Technology Stack

### Frontend (`apps/web`)
- **React 18** with **TypeScript** & **Vite**
- **Ant Design (v5)**: Clean enterprise UI components (Tables, Modals, Forms, Drawers, Cards, Statistics, DatePickers, Tags, Alerts, Steps)
- **React Router (v6)**: Declarative, permission-aware routing with `ProtectedRoute`
- **Axios**: Interceptors for automatic bearer token injection and HTTP-only cookie refresh
- **Client Biometrics**: Powered by `@vladmandic/human` with canvas face guide overlays
- **Vitest & React Testing Library**: Component, context, and user-interaction testing
- *Strict Rule Adherence*: **NO Tailwind CSS, NO Next.js, NO Bootstrap, NO Material-UI**.

### Backend (`apps/server`)
- **Node.js & Express** with **TypeScript**
- **PostgreSQL Database** accessed strictly via **`pg` (node-postgres) with parameterized SQL**
- *Strict Rule Adherence*: **NO ORM / Query Builder** (Zero Prisma, Sequelize, TypeORM, Drizzle, or Knex)
- **Migrations**: `node-pg-migrate` using pure SQL files
- **Transactions**: Atomic transaction helper `withTransaction(client => ...)`
- **Concurrency Protection**: Row-level locking (`FOR UPDATE`) + PostgreSQL partial unique index:
  ```sql
  CREATE UNIQUE INDEX one_open_attendance_session_per_user
  ON attendance_sessions(user_id)
  WHERE check_out_at IS NULL;
  ```
- **Security**: Argon2/Bcrypt password hashing, JWT Access (15m) + Secure HTTP-only Refresh Cookie (7d), Helmet, CORS, and Express Rate Limiting
- **Vitest & Supertest**: End-to-end integration and unit testing

---

## 3. Monorepo Structure

```text
workforce-access/
├── apps/
│   ├── server/
│   │   ├── db/
│   │   │   ├── migrations/
│   │   │   │   ├── 001_init.sql
│   │   │   │   └── 002_indexes.sql
│   │   │   └── seeds/
│   │   │       └── seed.ts
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   │   ├── face.service.ts
│   │   │   │   ├── liveness.service.ts
│   │   │   │   ├── geo.service.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   ├── users.service.ts
│   │   │   │   ├── offices.service.ts
│   │   │   │   ├── departments.service.ts
│   │   │   │   ├── attendance.service.ts
│   │   │   │   ├── reports.service.ts
│   │   │   │   └── audit.service.ts
│   │   │   ├── repositories/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   ├── validators/
│   │   │   ├── lib/
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   └── tests/
│   │       ├── unit/
│   │       └── integration/
│   │
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   │   ├── auth/
│       │   │   ├── employee/
│       │   │   └── admin/
│       │   ├── layouts/
│       │   ├── context/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── styles/
│       │   ├── App.tsx
│       │   └── main.tsx
│       └── tests/
│
├── packages/
│   └── shared/
│       └── src/
│           ├── types/
│           └── enums/
│
├── docker/
│   └── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

---

## 4. Docker Architecture & Database Isolation

### Safety & Existing Environment
This system runs on an isolated Docker network (`workforce_access_network`) on dedicated ports, guaranteeing **zero conflict** with pre-existing services (such as MySQL on port 3306 or existing phpMyAdmin/PostgreSQL on port 5432/5050):
- **PostgreSQL**: Host Port `5433` -> Container Port `5432`
- **pgAdmin**: Host Port `5051` -> Container Port `80`
- **Container Names**: `workforce_access_postgres`, `workforce_access_pgadmin`
- **Volume**: `workforce_access_postgres_data`

### Starting Docker Containers
```bash
docker compose -f docker/docker-compose.yml up -d
```

### Accessing pgAdmin 4
- URL: `http://localhost:5051`
- Username / Email: `admin@workforce.com`
- Password: `admin_workforce_2026`
- Connecting to DB inside pgAdmin:
  - Host: `postgres`
  - Port: `5432`
  - Maintenance DB: `workforce_access_db`
  - Username: `workforce_admin`
  - Password: `workforce_secure_pass_2026`

---

## 5. Development Seed Accounts & Credentials

All test accounts share the default development password: **`Password123!`**

| Name | Role | Email | Employee Code | Face Profile |
| :--- | :--- | :--- | :--- | :--- |
| **Sarah Connor** | `SUPER_ADMIN` | `superadmin@workforce.com` | `EMP-001` | Not Enrolled |
| **Elena Ramos** | `HR_ADMIN` | `hr@workforce.com` | `EMP-002` | Not Enrolled |
| **Marcus Vance** | `MANAGER` | `manager@workforce.com` | `EMP-003` | Not Enrolled |
| **Alex Mercer** | `EMPLOYEE` | `alex@workforce.com` | `EMP-101` | **Enrolled & Ready** |
| **Jessica Chen** | `EMPLOYEE` | `jessica@workforce.com` | `EMP-102` | Needs Enrollment |
| **David Kim** | `EMPLOYEE` | `david@workforce.com` | `EMP-103` | Needs Enrollment |

### Configured Office Locations
1. **Tech Park HQ (San Francisco)**: `37.774929, -122.419416` (Radius: 200m)
2. **Silicon Valley Innovation Hub (Palo Alto)**: `37.441883, -122.143019` (Radius: 250m)

---

## 6. Commands Reference

### Installation & Environment Setup
```bash
# 1. Install all monorepo dependencies
npm install

# 2. Build shared TypeScript package
npm run --workspace=packages/shared build

# 3. Run database migrations
npm run db:migrate

# 4. Seed database with demo staff, roles, and offices
npm run db:seed
```

### Running the Application
```bash
# Run both Backend API (port 4000) and Frontend Web (port 5173) concurrently
npm run dev

# Or run separately:
npm run dev:server
npm run dev:web
```

### Automated Testing & Quality Checks
```bash
# Run all tests across backend and frontend
npm test

# Run backend tests (Unit, Integration, Concurrency, RBAC)
npm run test:server

# Run frontend tests (Component, Auth, Navigation)
npm run test:web

# TypeScript typechecking
npm run typecheck

# Full production build
npm run build
```

---

## 7. Core Functional Workflows

### 1:1 Face Verification
Unlike 1:N face searching across thousands of images, this system executes verified 1:1 matching:
1. The employee supplies their employee code or corporate email.
2. The enrolled 128-dimensional template is retrieved from `face_templates`.
3. The candidate face embedding vector is computed in the client and verified against the enrolled vector via cosine similarity:
   $$\text{Similarity} = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \|\mathbf{B}\|}$$
4. Must meet or exceed the configurable `FACE_MATCH_THRESHOLD` (default `0.65`).

### Geofencing & GPS Accuracy
1. Browser geolocation submits `latitude`, `longitude`, and `accuracy` (in meters).
2. The backend validates that `accuracy <= LOCATION_MAX_ACCURACY_METERS` (default `100m`).
3. The backend calculates true Great-Circle distance using the **Haversine formula**.
4. Client-reported distance claims are never trusted; verification is solely calculated on the server.

### Atomic Concurrency Control
To prevent double check-ins when an employee rapidly clicks or two requests arrive simultaneously:
1. The backend check-in transaction acquires a row-level lock (`FOR UPDATE`).
2. The database enforces a partial unique constraint:
   `CREATE UNIQUE INDEX one_open_attendance_session_per_user ON attendance_sessions(user_id) WHERE check_out_at IS NULL;`
3. If concurrent requests pass initial checks, the second request triggers a database constraint rollback and receives machine-readable code `ALREADY_CHECKED_IN`.

### Reporting & CSV Export
- Multi-criteria filtering by Date Range, Office Location, Department, and Session Status (Active / Completed).
- High-performance, streaming server-side CSV generation avoiding heavy frontend DOM loads.

---

## 8. Security & Biometric Limitations

> [!CAUTION]
> **Production Biometric Disclaimer**
> 1. **Client GPS Manipulation**: Browser geolocation can be manipulated via Developer Tools sensors or mock location apps. For high-security physical access, physical BLE beacons or corporate WiFi IP checks should accompany GPS.
> 2. **Browser-Based Liveness vs. Hardware Anti-Spoofing**: Browser camera detection is software-based. It does not replace certified hardware-backed structured light, infrared (IR), or time-of-flight (ToF) 3D biometric sensors (e.g., Apple FaceID or dedicated biometric turnstiles).
> 3. **Camera Quality & Lighting**: Ambient lighting, backlighting, and webcam sensor resolution directly impact biometric similarity scores.
> 4. **Threshold Calibration**: `FACE_MATCH_THRESHOLD` must be calibrated against real-world camera hardware to optimize the trade-off between False Acceptance Rate (FAR) and False Rejection Rate (FRR).
