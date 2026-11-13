# Jospo E41 - Manufacturing & Stock Management System

A dedicated production tracking, inventory ledger, and dispatch management system engineered for the **Jospo E41** cooler manufacturing facility.

---

## Overview

The Jospo E41 system bridges the shop floor and dispatch bays, ensuring real-time visibility into cooler unit manufacturing, stock levels, and outgoing dispatches. With integrated QR code scanning, role-based access control, and an immutable double-entry stock ledger in PostgreSQL/Supabase, the platform prevents inventory discrepancies and streamlines day-to-day operations.

---

## Features

- **Role-Based Access Control (RBAC):** Strict permissions dividing system actions among `admin`, `production`, and `dispatch` teams.
- **QR Code Scanning & Model Identification:** Rapid scanning using mobile cameras or handheld barcode/QR readers to record production output and load dispatch trucks error-free.
- **Production Tracking:** Fast recording of manufactured air cooler models per shift/day with automatic ledger updates.
- **Dispatch Management:** Two-stage dispatch workflow (`draft` to `confirmed`) with automated stock pre-checks, atomic inventory deduction, and cancellation/reversal support.
- **Real-Time Stock Ledger:** Immutable audit trail in PostgreSQL tracking every production run, dispatch shipment, reversal, and manual stock adjustment.
- **Live Reporting & Dashboard:** High-level metrics for daily manufactured units, dispatches, active pending consignments, and per-model warehouse balances.
- **Data Export:** Exporting stock and dispatch reports directly to Excel (`.xlsx`) format.

---

## Tech Stack

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
- **UI & Styling:** [React 18](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **Backend & Database:** [Supabase](https://supabase.com/) (PostgreSQL with Row Level Security, Triggers & PL/pgSQL Stored Procedures)
- **Authentication:** Supabase SSR Auth with session synchronization via Next.js Middleware
- **QR Scanning & Generation:** `html5-qrcode` & `qrcode.react`
- **Utilities:** `date-fns`, `xlsx`

---

## User Roles & Permissions

| Role | Permissions |
| :--- | :--- |
| **`admin`** | Full access: manage employees, cooler models master, view all logs, adjust inventory, confirm/cancel dispatches, full dashboard access. |
| **`production`** | Record daily finished goods production by model (manual or QR scan); view daily production summaries. |
| **`dispatch`** | Create dispatch drafts, scan items into vehicles, confirm dispatches (triggering atomic stock deduction), and manage vehicle manifests. |

---

## QR Scanning Workflow

1. **Model QR Code Master:**
   - Every cooler model has a unique `qr_data` identifier string (e.g., `JOSPO-MDL-DESERT-70L`).
   - QR labels can be printed directly from the cooler models catalog.
2. **Production Floor:**
   - As coolers pass final inspection/packaging, operators scan the model QR using mobile or tablet cameras.
   - The system matches `qr_data`, increments shift count, and logs an entry linked to the operator.
3. **Dispatch Bay:**
   - When loading trucks, dispatch handlers scan each model bundle or batch QR to build the dispatch manifest.
   - The system verifies real-time stock availability before allowing dispatch confirmation.

---

## Project Structure

```
jospo-e41/
├── sql/
│   └── schema.sql              # Supabase PostgreSQL schema, RLS, functions & triggers
├── src/
│   ├── app/
│   │   ├── globals.css         # Global styles & Tailwind components
│   │   ├── layout.js           # Root layout with AuthProvider & Inter font
│   │   └── login/
│   │       └── page.js         # Branded login page
│   ├── contexts/
│   │   └── AuthContext.js      # Auth context & session listener hook (useAuth)
│   ├── lib/
│   │   ├── supabase.js         # Browser client singleton for Supabase
│   │   └── supabase-server.js  # Server client for SSR & Server Components
│   └── middleware.js           # Auth guard and session token refresh
├── .env.local.example          # Environment variables template
├── jsconfig.json               # Path aliases (@/* -> ./src/*)
├── next.config.mjs             # Next.js configuration
├── package.json                # Project dependencies and scripts
├── postcss.config.js           # PostCSS configuration
├── tailwind.config.js          # Tailwind CSS configuration
└── README.md                   # System documentation
```

---

## Setup Instructions

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.17.0 or higher recommended)
- [npm](https://www.npmjs.com/) or [pnpm](https://pnpm.io/)
- A [Supabase](https://supabase.com/) account and project

### 2. Database Setup
1. Open your Supabase project dashboard.
2. Navigate to the **SQL Editor**.
3. Open `sql/schema.sql` from this repository and run the entire script.
4. This script sets up:
   - Extensions (`uuid-ossp`)
   - Tables (`employees`, `cooler_models`, `production_entries`, `dispatches`, `dispatch_items`, `stock_transactions`)
   - Database Views (`current_stock`, `daily_production_summary`, `daily_dispatch_summary`, `stock_ledger`)
   - Row Level Security (RLS) policies
   - Stored functions (`get_dashboard_stats`, `confirm_dispatch`, `cancel_dispatch`, `update_updated_at`)
   - Optimized indexes and triggers

### 3. Environment Configuration
Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Fill in your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Create Initial Admin User
In your Supabase project:
1. Go to **Authentication -> Users** and click **Add User**.
2. Supply an email and password (e.g. `admin@jospo.com`).
3. In the **SQL Editor**, insert an employee profile linked to that Auth UID:
```sql
INSERT INTO public.employees (id, name, email, role, is_active)
VALUES ('<AUTH-USER-UUID-FROM-SUPABASE>', 'Admin User', 'admin@jospo.com', 'admin', true);
```

### 5. Install Dependencies & Run
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Unauthenticated requests will automatically redirect to `/login`.
