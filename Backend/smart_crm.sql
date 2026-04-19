-- ============================================================
-- smart_crm.sql — Database Schema
-- Smart Public Service CRM
-- Run: sqlite3 smart_crm.db < smart_crm.sql
-- ============================================================

-- Drop existing tables (for clean reset)
DROP TABLE IF EXISTS corruption_reports;
DROP TABLE IF EXISTS complaints;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS service_prices;

-- ── Employees ─────────────────────────────────────────────
CREATE TABLE employees (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    department  TEXT NOT NULL,
    phone       TEXT,
    location    TEXT,
    status      TEXT DEFAULT 'available',   -- available / busy
    resolved    INTEGER DEFAULT 0,
    pending     INTEGER DEFAULT 0,
    rating      REAL DEFAULT 4.0,
    badge       TEXT,                       -- gold / silver / bronze / null
    created_at  TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── Complaints & Service Requests ─────────────────────────
CREATE TABLE complaints (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    phone         TEXT NOT NULL,
    location      TEXT NOT NULL,
    description   TEXT NOT NULL,
    category      TEXT NOT NULL,
    request_type  TEXT NOT NULL,            -- complaint / service
    priority      TEXT DEFAULT 'medium',   -- critical / high / medium / low
    status        TEXT DEFAULT 'pending',  -- pending / in-progress / resolved / escalated
    progress      INTEGER DEFAULT 0,       -- 0-100
    assigned_to   TEXT,                    -- employee name
    employee_id   TEXT REFERENCES employees(id),
    sla_deadline  TEXT,
    employee_note TEXT,
    submitted_at  TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at    TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── Corruption Reports ─────────────────────────────────────
CREATE TABLE corruption_reports (
    id              TEXT PRIMARY KEY,
    official_name   TEXT,                  -- may be anonymous
    department      TEXT NOT NULL,
    amount_demanded TEXT NOT NULL,
    service         TEXT NOT NULL,
    description     TEXT,
    status          TEXT DEFAULT 'under_review',  -- under_review / investigating / closed
    reported_at     TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ── Service Prices ─────────────────────────────────────────
CREATE TABLE service_prices (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    service_name    TEXT NOT NULL,
    official_fee    TEXT NOT NULL,
    processing_days INTEGER NOT NULL
);

-- ── Seed: Employees ───────────────────────────────────────
INSERT INTO employees (id, name, department, phone, location, status, resolved, pending, rating, badge) VALUES
    ('EMP-01', 'Amit Verma',     'Infrastructure', '+91-9811100001', 'Sector 12',   'available', 24, 2, 4.8, 'gold'),
    ('EMP-02', 'Suresh Kumar',   'Roads & PWD',    '+91-9811100002', 'Sector 5',    'busy',      18, 3, 4.5, 'silver'),
    ('EMP-03', 'Ravi Singh',     'Sanitation',     '+91-9811100003', 'Sector 8',    'available', 31, 1, 4.9, 'gold'),
    ('EMP-04', 'Deepak Yadav',   'Water Supply',   '+91-9811100004', 'Sector 14',   'busy',      12, 4, 4.2, 'bronze'),
    ('EMP-05', 'Inspector Kaur', 'Enforcement',    '+91-9811100005', 'Laxmi Nagar', 'available',  9, 5, 3.9, NULL);

-- ── Seed: Service Prices ──────────────────────────────────
INSERT INTO service_prices (service_name, official_fee, processing_days) VALUES
    ('Birth Certificate',      'Rs. 50',   3),
    ('Building Plan Approval', 'Rs. 500',  30),
    ('Water Connection',       'Rs. 1200', 7),
    ('Trade License',          'Rs. 800',  15),
    ('Property Tax Receipt',   'Free',     1),
    ('Road Repair Request',    'Free',     5),
    ('Electricity Meter',      'Rs. 200',  7);

-- ── Seed: Sample Complaints ───────────────────────────────
INSERT INTO complaints (id, name, phone, location, description, category, request_type, priority, status, progress, assigned_to, employee_id, sla_deadline) VALUES
    ('CMP-001','Rahul Sharma', '9800000001','MG Road, Sector 12',   'Streetlight on MG Road has been broken for 5 days','Infrastructure','complaint','medium',  'resolved',  100,'Amit Verma',    'EMP-01','2026-03-03'),
    ('CMP-002','Priya Patel',  '9800000002','School Lane, Sector 5','Large pothole near school zone causing accidents',  'Roads',        'complaint','high',    'in-progress',65,'Suresh Kumar',  'EMP-02','2026-03-10'),
    ('CMP-003','Anita Gupta',  '9800000003','Nehru Nagar Colony',   'Garbage not collected for 3 days, stench rising',  'Sanitation',   'complaint','high',    'pending',     10,'Ravi Singh',    'EMP-03','2026-03-09'),
    ('CMP-004','Vikram Joshi', '9800000004','Shastri Block B',      'Water supply completely stopped since 2 days',     'Water Supply', 'complaint','critical','in-progress',  40,'Deepak Yadav',  'EMP-04','2026-03-07'),
    ('CMP-005','Sunita Mehta', '9800000005','Central Park Area',    'Street dogs menacing children near the park',      'Animal Control','complaint','medium',  'pending',      0, NULL,           NULL,   '2026-03-12'),
    ('CMP-006','Mohan Das',    '9800000006','Laxmi Nagar',          'Illegal construction blocking the main road',      'Infrastructure','complaint','critical','escalated',   20,'Inspector Kaur','EMP-05','2026-03-04');
