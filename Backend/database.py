"""
database.py — SQLite database operations
All CRUD functions for the CRM system.
"""

import sqlite3
import uuid
from datetime import date, datetime
from typing import Optional

DB_PATH = "smart_crm.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # return rows as dicts
    return conn


# ─────────────────────────────────────────────────────────
# Schema Initialization
# ─────────────────────────────────────────────────────────

def init_db():
    """Create all tables if they don't exist, and seed initial data."""
    conn = get_connection()
    cur  = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS employees (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            department  TEXT NOT NULL,
            phone       TEXT,
            location    TEXT,
            status      TEXT DEFAULT 'available',  -- available / busy
            resolved    INTEGER DEFAULT 0,
            pending     INTEGER DEFAULT 0,
            rating      REAL DEFAULT 4.0,
            badge       TEXT,                       -- gold / silver / bronze / null
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS complaints (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            phone        TEXT NOT NULL,
            location     TEXT NOT NULL,
            description  TEXT NOT NULL,
            category     TEXT NOT NULL,
            request_type TEXT NOT NULL,
            priority     TEXT DEFAULT 'medium',
            status       TEXT DEFAULT 'pending',
            progress     INTEGER DEFAULT 0,
            assigned_to  TEXT,
            employee_id  TEXT,
            sla_deadline TEXT,
            employee_note TEXT,
            submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at   TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        );

        CREATE TABLE IF NOT EXISTS corruption_reports (
            id              TEXT PRIMARY KEY,
            official_name   TEXT,
            department      TEXT NOT NULL,
            amount_demanded TEXT NOT NULL,
            service         TEXT NOT NULL,
            description     TEXT,
            status          TEXT DEFAULT 'under_review',
            reported_at     TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS service_prices (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            service_name    TEXT NOT NULL,
            official_fee    TEXT NOT NULL,
            processing_days INTEGER NOT NULL
        );
    """)

    # Seed employees if table is empty
    cur.execute("SELECT COUNT(*) as cnt FROM employees")
    if cur.fetchone()["cnt"] == 0:
        employees = [
            ("EMP-01", "Amit Verma",    "Infrastructure", "+91-9811100001", "Sector 12", "available", 24, 2, 4.8, "gold"),
            ("EMP-02", "Suresh Kumar",  "Roads & PWD",    "+91-9811100002", "Sector 5",  "busy",      18, 3, 4.5, "silver"),
            ("EMP-03", "Ravi Singh",    "Sanitation",     "+91-9811100003", "Sector 8",  "available", 31, 1, 4.9, "gold"),
            ("EMP-04", "Deepak Yadav",  "Water Supply",   "+91-9811100004", "Sector 14", "busy",      12, 4, 4.2, "bronze"),
            ("EMP-05", "Inspector Kaur","Enforcement",    "+91-9811100005", "Laxmi Nagar","available",  9, 5, 3.9, None),
        ]
        cur.executemany(
            "INSERT INTO employees (id,name,department,phone,location,status,resolved,pending,rating,badge) VALUES (?,?,?,?,?,?,?,?,?,?)",
            employees
        )

    # Seed service prices if table is empty
    cur.execute("SELECT COUNT(*) as cnt FROM service_prices")
    if cur.fetchone()["cnt"] == 0:
        prices = [
            ("Birth Certificate",       "Rs. 50",   3),
            ("Building Plan Approval",  "Rs. 500",  30),
            ("Water Connection",        "Rs. 1200", 7),
            ("Trade License",           "Rs. 800",  15),
            ("Property Tax Receipt",    "Free",     1),
            ("Road Repair Request",     "Free",     5),
            ("Electricity Meter",       "Rs. 200",  7),
        ]
        cur.executemany(
            "INSERT INTO service_prices (service_name, official_fee, processing_days) VALUES (?,?,?)",
            prices
        )

    # Seed sample complaints
    cur.execute("SELECT COUNT(*) as cnt FROM complaints")
    if cur.fetchone()["cnt"] == 0:
        from datetime import timedelta
        today = date.today()
        sample = [
            ("CMP-001","Rahul Sharma",  "9800000001","MG Road, Sector 12",   "Streetlight broken",          "Infrastructure","complaint","medium","resolved",  100,"Amit Verma",  "EMP-01",(today-timedelta(7)).isoformat()),
            ("CMP-002","Priya Patel",   "9800000002","School Lane, Sector 5", "Pothole near school zone",    "Roads",         "complaint","high",  "in-progress", 65,"Suresh Kumar","EMP-02",(today+timedelta(2)).isoformat()),
            ("CMP-003","Anita Gupta",   "9800000003","Nehru Nagar Colony",    "Garbage not collected 3 days","Sanitation",    "complaint","high",  "pending",     10,"Ravi Singh",  "EMP-03",(today+timedelta(1)).isoformat()),
            ("CMP-004","Vikram Joshi",  "9800000004","Shastri Block B",       "Water supply disruption",     "Water Supply",  "complaint","critical","in-progress",40,"Deepak Yadav","EMP-04",(today+timedelta(1)).isoformat()),
            ("CMP-005","Sunita Mehta",  "9800000005","Central Park Area",     "Street dog menace near park", "Animal Control","complaint","medium","pending",      0, None,          None,   (today+timedelta(4)).isoformat()),
            ("CMP-006","Mohan Das",     "9800000006","Laxmi Nagar",           "Illegal construction blocking road","Infrastructure","complaint","critical","escalated",20,"Inspector Kaur","EMP-05",(today-timedelta(4)).isoformat()),
        ]
        cur.executemany(
            """INSERT INTO complaints
               (id,name,phone,location,description,category,request_type,priority,status,progress,assigned_to,employee_id,sla_deadline)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            sample
        )

    conn.commit()
    conn.close()


# ─────────────────────────────────────────────────────────
# Complaint Operations
# ─────────────────────────────────────────────────────────

def insert_complaint(data: dict) -> str:
    complaint_id = "CMP-" + str(uuid.uuid4())[:6].upper()
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        """INSERT INTO complaints
           (id,name,phone,location,description,category,request_type,priority,
            assigned_to,employee_id,sla_deadline,status,progress,submitted_at)
           VALUES (:id,:name,:phone,:location,:description,:category,:request_type,
                   :priority,:assigned_to,:employee_id,:sla_deadline,:status,:progress,:submitted_at)""",
        {**data, "id": complaint_id}
    )
    # Mark employee as busy
    if data.get("employee_id"):
        cur.execute("UPDATE employees SET status='busy', pending=pending+1 WHERE id=?", (data["employee_id"],))
    conn.commit()
    conn.close()
    return complaint_id


def get_complaint(complaint_id: str) -> Optional[dict]:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT * FROM complaints WHERE id=?", (complaint_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def get_requests_by_phone(phone: str) -> list:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT * FROM complaints WHERE phone=? ORDER BY submitted_at DESC", (phone,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def update_complaint_status(complaint_id: str, status: str, progress: Optional[int], note: Optional[str] = None) -> bool:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        """UPDATE complaints SET status=?, progress=COALESCE(?,progress),
           employee_note=COALESCE(?,employee_note), updated_at=? WHERE id=?""",
        (status, progress, note, datetime.now().isoformat(), complaint_id)
    )
    affected = cur.rowcount

    # If resolved, update employee stats
    if status == "resolved":
        cur.execute("SELECT employee_id FROM complaints WHERE id=?", (complaint_id,))
        row = cur.fetchone()
        if row and row["employee_id"]:
            cur.execute(
                "UPDATE employees SET resolved=resolved+1, pending=MAX(0,pending-1), status='available' WHERE id=?",
                (row["employee_id"],)
            )

    conn.commit()
    conn.close()
    return affected > 0


def get_all_complaints(status: Optional[str] = None, category: Optional[str] = None) -> list:
    conn = get_connection()
    cur  = conn.cursor()
    query = "SELECT * FROM complaints WHERE 1=1"
    params = []
    if status:
        query += " AND status=?"
        params.append(status)
    if category:
        query += " AND category=?"
        params.append(category)
    query += " ORDER BY submitted_at DESC"
    cur.execute(query, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ─────────────────────────────────────────────────────────
# Employee Operations
# ─────────────────────────────────────────────────────────

def get_best_employee(location: str, category: str) -> Optional[dict]:
    """
    Simple assignment logic:
    - Prefer available employees in the same department category.
    - Fall back to any available employee.
    """
    dept_map = {
        "Road Damage": "Roads & PWD",
        "Roads":       "Roads & PWD",
        "Garbage":     "Sanitation",
        "Sanitation":  "Sanitation",
        "Water Leakage":"Water Supply",
        "Water Supply": "Water Supply",
        "Infrastructure": "Infrastructure",
        "Street Light":   "Infrastructure",
        "Electricity Meter": "Infrastructure",
        "Enforcement":    "Enforcement",
    }
    dept = dept_map.get(category, "Infrastructure")
    conn = get_connection()
    cur  = conn.cursor()

    # Try department match first
    cur.execute(
        "SELECT * FROM employees WHERE status='available' AND department=? ORDER BY pending ASC LIMIT 1",
        (dept,)
    )
    row = cur.fetchone()

    if not row:
        # Fallback: any available employee
        cur.execute("SELECT * FROM employees WHERE status='available' ORDER BY pending ASC LIMIT 1")
        row = cur.fetchone()

    conn.close()
    return dict(row) if row else None


def get_employee_tasks(employee_id: str) -> Optional[list]:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT id FROM employees WHERE id=?", (employee_id,))
    if not cur.fetchone():
        conn.close()
        return None
    cur.execute(
        "SELECT * FROM complaints WHERE employee_id=? AND status != 'resolved' ORDER BY sla_deadline ASC",
        (employee_id,)
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_all_employees() -> list:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT * FROM employees ORDER BY resolved DESC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ─────────────────────────────────────────────────────────
# Admin Stats
# ─────────────────────────────────────────────────────────

def get_overview_stats() -> dict:
    conn = get_connection()
    cur  = conn.cursor()

    stats = {}
    for status in ("pending", "in-progress", "resolved", "escalated"):
        cur.execute("SELECT COUNT(*) as cnt FROM complaints WHERE status=?", (status,))
        stats[status] = cur.fetchone()["cnt"]

    cur.execute("SELECT COUNT(*) as cnt FROM complaints")
    stats["total"] = cur.fetchone()["cnt"]

    # Category breakdown
    cur.execute("SELECT category, COUNT(*) as cnt FROM complaints GROUP BY category ORDER BY cnt DESC")
    stats["by_category"] = [dict(r) for r in cur.fetchall()]

    conn.close()
    return stats


# ─────────────────────────────────────────────────────────
# Corruption Reports
# ─────────────────────────────────────────────────────────

def insert_corruption_report(data: dict) -> str:
    report_id = "CR-" + str(uuid.uuid4())[:6].upper()
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        """INSERT INTO corruption_reports
           (id,official_name,department,amount_demanded,service,description,status,reported_at)
           VALUES (:id,:official_name,:department,:amount_demanded,:service,:description,:status,:reported_at)""",
        {**data, "id": report_id}
    )
    conn.commit()
    conn.close()
    return report_id


def get_corruption_reports() -> list:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT * FROM corruption_reports ORDER BY reported_at DESC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ─────────────────────────────────────────────────────────
# Service Prices
# ─────────────────────────────────────────────────────────

def get_service_prices() -> list:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT * FROM service_prices")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ─── Run init on import ────────────────────────────────
init_db()
