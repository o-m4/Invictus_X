"""
database.py — Smart Civic Service Platform
Full schema + all CRUD operations.
All bugs fixed — see FIX comments.
"""

import sqlite3
import uuid
import json
from datetime import date, datetime, timedelta
from typing import Optional

DB_PATH = "smart_crm.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ─────────────────────────────────────────────────────────
# Schema + migrations
# ─────────────────────────────────────────────────────────

def init_db():
    conn = get_connection()
    cur  = conn.cursor()

    cur.executescript("""
        CREATE TABLE IF NOT EXISTS employees (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            department  TEXT NOT NULL,
            phone       TEXT,
            location    TEXT,
            status      TEXT DEFAULT 'available',
            resolved    INTEGER DEFAULT 0,
            pending     INTEGER DEFAULT 0,
            rating      REAL DEFAULT 4.0,
            badge       TEXT,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS complaints (
            id                  TEXT PRIMARY KEY,
            name                TEXT NOT NULL,
            phone               TEXT NOT NULL,
            location            TEXT NOT NULL,
            description         TEXT NOT NULL,
            category            TEXT NOT NULL,
            request_type        TEXT NOT NULL,
            priority            TEXT DEFAULT 'medium',
            status              TEXT DEFAULT 'pending',
            progress            INTEGER DEFAULT 0,
            assigned_to         TEXT,
            employee_id         TEXT,
            sla_deadline        TEXT,
            accepted_at         TEXT,
            deadline_custom     TEXT,
            completed_at        TEXT,
            citizen_image       TEXT,
            proof_note          TEXT,
            proof_image         TEXT,
            proof_submitted_at  TEXT,
            ai_verified         TEXT,
            ai_confidence       INTEGER,
            ai_reason           TEXT,
            employee_note       TEXT,
            submitted_at        TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at          TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (employee_id) REFERENCES employees(id)
        );

        CREATE TABLE IF NOT EXISTS events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type   TEXT NOT NULL,
            complaint_id TEXT,
            payload      TEXT,
            created_at   TEXT DEFAULT CURRENT_TIMESTAMP
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

        -- FIX: chat messages table — was missing entirely
        CREATE TABLE IF NOT EXISTS messages (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            complaint_id TEXT NOT NULL,
            sender_role  TEXT NOT NULL,   -- 'citizen' | 'employee'
            sender_name  TEXT NOT NULL,
            message_text TEXT NOT NULL,
            message_type TEXT DEFAULT 'text',   -- 'text' | 'photo' | 'status'
            read_by_other INTEGER DEFAULT 0,
            created_at   TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Migrations — add new columns safely to existing databases
    for col, typ in [
        ("accepted_at","TEXT"), ("deadline_custom","TEXT"), ("completed_at","TEXT"),
        ("citizen_image","TEXT"), ("proof_note","TEXT"), ("proof_image","TEXT"),
        ("proof_submitted_at","TEXT"), ("ai_verified","TEXT"),
        ("ai_confidence","INTEGER"), ("ai_reason","TEXT"),
    ]:
        _safe_add_column(cur, "complaints", col, typ)

    # Seed employees
    cur.execute("SELECT COUNT(*) as cnt FROM employees")
    if cur.fetchone()["cnt"] == 0:
        cur.executemany(
            "INSERT INTO employees (id,name,department,phone,location,status,resolved,pending,rating,badge) VALUES (?,?,?,?,?,?,?,?,?,?)",
            [
                ("EMP-01","Amit Verma",    "Infrastructure","+91-9811100001","Sector 12","available",24,2,4.8,"gold"),
                ("EMP-02","Suresh Kumar",  "Roads & PWD",   "+91-9811100002","Sector 5", "busy",     18,3,4.5,"silver"),
                ("EMP-03","Ravi Singh",    "Sanitation",    "+91-9811100003","Sector 8", "available",31,1,4.9,"gold"),
                ("EMP-04","Deepak Yadav",  "Water Supply",  "+91-9811100004","Sector 14","busy",     12,4,4.2,"bronze"),
                ("EMP-05","Inspector Kaur","Enforcement",   "+91-9811100005","Laxmi Nagar","available",9,5,3.9,None),
            ]
        )

    # Seed service prices
    cur.execute("SELECT COUNT(*) as cnt FROM service_prices")
    if cur.fetchone()["cnt"] == 0:
        cur.executemany(
            "INSERT INTO service_prices (service_name,official_fee,processing_days) VALUES (?,?,?)",
            [
                ("Birth Certificate","Rs. 50",3),
                ("Building Plan Approval","Rs. 500",30),
                ("Water Connection","Rs. 1200",7),
                ("Trade License","Rs. 800",15),
                ("Property Tax Receipt","Free",1),
                ("Road Repair Request","Free",5),
                ("Electricity Meter","Rs. 200",7),
            ]
        )

    # Seed sample complaints
    cur.execute("SELECT COUNT(*) as cnt FROM complaints")
    if cur.fetchone()["cnt"] == 0:
        today = date.today()
        cur.executemany("""
            INSERT INTO complaints
            (id,name,phone,location,description,category,request_type,priority,status,progress,
             assigned_to,employee_id,sla_deadline,ai_verified,ai_confidence,ai_reason)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, [
            ("CMP-001","Rahul Sharma","9800000001","MG Road, Sector 12","Streetlight broken",
             "Infrastructure","complaint","medium","resolved",100,"Amit Verma","EMP-01",
             (today-timedelta(7)).isoformat(),"verified",92,"Completion keywords: fixed, installed"),
            ("CMP-002","Priya Patel","9800000002","School Lane, Sector 5","Pothole near school zone",
             "Roads","complaint","high","in-progress",65,"Suresh Kumar","EMP-02",
             (today+timedelta(2)).isoformat(),None,None,None),
            ("CMP-003","Anita Gupta","9800000003","Nehru Nagar Colony","Garbage not collected 3 days",
             "Sanitation","complaint","high","accepted",10,"Ravi Singh","EMP-03",
             (today+timedelta(1)).isoformat(),None,None,None),
            ("CMP-004","Vikram Joshi","9800000004","Shastri Block B","Water supply disruption",
             "Water Supply","complaint","critical","in-progress",40,"Deepak Yadav","EMP-04",
             (today+timedelta(1)).isoformat(),None,None,None),
            ("CMP-005","Sunita Mehta","9800000005","Central Park Area","Street dog menace near park",
             "Animal Control","complaint","medium","pending",0,None,None,
             (today+timedelta(4)).isoformat(),None,None,None),
            ("CMP-006","Mohan Das","9800000006","Laxmi Nagar","Illegal construction blocking road",
             "Infrastructure","complaint","critical","escalated",20,"Inspector Kaur","EMP-05",
             (today-timedelta(4)).isoformat(),"needs-review",48,"Insufficient evidence in proof"),
        ])

    conn.commit()
    conn.close()


def _safe_add_column(cur, table, col, col_type):
    try:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")
    except Exception:
        pass


# ─────────────────────────────────────────────────────────
# Event bus
# ─────────────────────────────────────────────────────────

def push_event(event_type: str, complaint_id: str, payload: dict):
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "INSERT INTO events (event_type, complaint_id, payload) VALUES (?,?,?)",
        (event_type, complaint_id, json.dumps(payload))
    )
    conn.commit()
    conn.close()


def get_events_since(since_id: int = 0, limit: int = 50) -> list:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "SELECT * FROM events WHERE id > ? ORDER BY id ASC LIMIT ?",
        (since_id, limit)
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_latest_event_id() -> int:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT COALESCE(MAX(id),0) as mid FROM events")
    row = cur.fetchone()
    conn.close()
    return row["mid"]


# ─────────────────────────────────────────────────────────
# Chat messages
# ─────────────────────────────────────────────────────────

def save_message(complaint_id: str, sender_role: str, sender_name: str,
                 message_text: str, message_type: str = "text") -> dict:
    """FIX: Save message to DB instead of only localStorage."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        """INSERT INTO messages (complaint_id, sender_role, sender_name, message_text, message_type)
           VALUES (?,?,?,?,?)""",
        (complaint_id, sender_role, sender_name, message_text, message_type)
    )
    row_id     = cur.lastrowid
    created_at = datetime.now().isoformat()
    conn.commit()
    conn.close()
    return {
        "id": row_id, "complaint_id": complaint_id,
        "sender_role": sender_role, "sender_name": sender_name,
        "message_text": message_text, "message_type": message_type,
        "read_by_other": 0, "created_at": created_at,
    }


def get_messages(complaint_id: str, since_id: int = 0) -> list:
    """FIX: Fetch messages from DB. since_id enables incremental polling."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "SELECT * FROM messages WHERE complaint_id=? AND id > ? ORDER BY id ASC",
        (complaint_id, since_id)
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def mark_messages_read(complaint_id: str, reader_role: str):
    """Mark all messages in a conversation as read by the other side."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "UPDATE messages SET read_by_other=1 WHERE complaint_id=? AND sender_role!=?",
        (complaint_id, reader_role)
    )
    conn.commit()
    conn.close()


def get_unread_count(complaint_id: str, reader_role: str) -> int:
    """Count unread messages for a given role in a conversation."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) as cnt FROM messages WHERE complaint_id=? AND sender_role!=? AND read_by_other=0",
        (complaint_id, reader_role)
    )
    row = cur.fetchone()
    conn.close()
    return row["cnt"]


def get_conversations_for_employee(employee_id: str) -> list:
    """FIX: Get all complaints assigned to employee that have messages or are active."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        SELECT c.id, c.name, c.description, c.category, c.status, c.sla_deadline,
               c.priority, c.phone,
               (SELECT COUNT(*) FROM messages m WHERE m.complaint_id=c.id AND m.sender_role='citizen' AND m.read_by_other=0) as unread_count,
               (SELECT message_text FROM messages m2 WHERE m2.complaint_id=c.id ORDER BY m2.id DESC LIMIT 1) as last_message,
               (SELECT created_at FROM messages m3 WHERE m3.complaint_id=c.id ORDER BY m3.id DESC LIMIT 1) as last_message_time
        FROM complaints c
        WHERE c.employee_id=? AND c.status NOT IN ('rejected')
        ORDER BY last_message_time DESC, c.submitted_at DESC
    """, (employee_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_conversations_for_citizen(phone: str) -> list:
    """FIX: Get all complaints for a citizen phone with last message preview."""
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        SELECT c.id, c.description, c.category, c.status, c.sla_deadline,
               c.priority, c.assigned_to, c.employee_id,
               (SELECT COUNT(*) FROM messages m WHERE m.complaint_id=c.id AND m.sender_role='employee' AND m.read_by_other=0) as unread_count,
               (SELECT message_text FROM messages m2 WHERE m2.complaint_id=c.id ORDER BY m2.id DESC LIMIT 1) as last_message,
               (SELECT created_at FROM messages m3 WHERE m3.complaint_id=c.id ORDER BY m3.id DESC LIMIT 1) as last_message_time
        FROM complaints c
        WHERE c.phone=?
        ORDER BY last_message_time DESC, c.submitted_at DESC
    """, (phone,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ─────────────────────────────────────────────────────────
# Complaint CRUD
# ─────────────────────────────────────────────────────────

def insert_complaint(data: dict) -> str:
    complaint_id = "CMP-" + str(uuid.uuid4())[:6].upper()
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO complaints
        (id,name,phone,location,description,category,request_type,priority,
         assigned_to,employee_id,sla_deadline,status,progress,citizen_image,submitted_at)
        VALUES (:id,:name,:phone,:location,:description,:category,:request_type,:priority,
                :assigned_to,:employee_id,:sla_deadline,:status,:progress,:citizen_image,:submitted_at)
    """, {**data, "id": complaint_id})
    if data.get("employee_id"):
        cur.execute(
            "UPDATE employees SET status='busy', pending=pending+1 WHERE id=?",
            (data["employee_id"],)
        )
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


def accept_complaint(complaint_id: str, employee_id: str, deadline: str) -> bool:
    """
    FIX: Accept when status is 'pending' only.
    Also assign employee_id if complaint was unassigned.
    """
    conn = get_connection()
    cur  = conn.cursor()
    # FIX: Allow accept if pending regardless of employee assignment
    cur.execute("""
        UPDATE complaints
        SET status='accepted', accepted_at=?, deadline_custom=?,
            employee_id=COALESCE(employee_id, ?),
            assigned_to=COALESCE(assigned_to, (SELECT name FROM employees WHERE id=?)),
            updated_at=?
        WHERE id=? AND status='pending'
    """, (
        datetime.now().isoformat(), deadline,
        employee_id, employee_id,
        datetime.now().isoformat(),
        complaint_id
    ))
    affected = cur.rowcount
    if affected:
        # Mark employee busy
        cur.execute(
            "UPDATE employees SET pending=pending+1 WHERE id=? AND status='available'",
            (employee_id,)
        )
    conn.commit()
    conn.close()
    return affected > 0


def update_complaint_status(complaint_id: str, status: str,
                             progress: Optional[int], note: Optional[str] = None) -> bool:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        UPDATE complaints
        SET status=?, progress=COALESCE(?,progress),
            employee_note=COALESCE(?,employee_note), updated_at=?
        WHERE id=?
    """, (status, progress, note, datetime.now().isoformat(), complaint_id))
    affected = cur.rowcount
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


def submit_proof(complaint_id: str, proof_note: str, proof_image: Optional[str]) -> bool:
    conn = get_connection()
    cur  = conn.cursor()
    now  = datetime.now().isoformat()
    cur.execute("""
        UPDATE complaints
        SET status='proof-submitted', proof_note=?, proof_image=?,
            proof_submitted_at=?, completed_at=?, progress=95, updated_at=?
        WHERE id=?
    """, (proof_note, proof_image, now, now, now, complaint_id))
    affected = cur.rowcount
    conn.commit()
    conn.close()
    return affected > 0


def save_ai_verification(complaint_id: str, verdict: str, confidence: int, reason: str) -> bool:
    final_status = {
        "verified":     "resolved",
        "needs-review": "needs-review",
        "rejected":     "rejected",
    }.get(verdict, "needs-review")
    conn = get_connection()
    cur  = conn.cursor()
    now  = datetime.now().isoformat()
    cur.execute("""
        UPDATE complaints
        SET ai_verified=?, ai_confidence=?, ai_reason=?, status=?, progress=100, updated_at=?
        WHERE id=?
    """, (verdict, confidence, reason, final_status, now, complaint_id))
    affected = cur.rowcount
    if final_status == "resolved":
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
    q      = "SELECT * FROM complaints WHERE 1=1"
    params = []
    if status:
        q += " AND status=?"; params.append(status)
    if category:
        q += " AND category=?"; params.append(category)
    q += " ORDER BY submitted_at DESC"
    cur.execute(q, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def get_pending_complaints() -> list:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        SELECT * FROM complaints
        WHERE status='pending'
        ORDER BY
          CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          submitted_at ASC
    """)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ─────────────────────────────────────────────────────────
# Employee
# ─────────────────────────────────────────────────────────

def get_best_employee(location: str, category: str) -> Optional[dict]:
    # FIX: Expanded dept_map to cover all frontend-sent category values
    dept_map = {
        "Road Damage":       "Roads & PWD",
        "Roads":             "Roads & PWD",
        "Garbage":           "Sanitation",
        "Sanitation":        "Sanitation",
        "Water Leakage":     "Water Supply",
        "Water Supply":      "Water Supply",
        "Infrastructure":    "Infrastructure",
        "Street Light":      "Infrastructure",
        "Electricity Meter": "Infrastructure",
        "Building Approval": "Infrastructure",
        "Enforcement":       "Enforcement",
        "Sewage Problem":    "Sanitation",
        "Other Issue":       "Infrastructure",
        "Animal Control":    "Infrastructure",
        # Service types
        "Birth Certificate":       "Infrastructure",
        "Water Connection":        "Water Supply",
        "Trade License":           "Enforcement",
        "Property Tax":            "Infrastructure",
        "Other Services":          "Infrastructure",
    }
    dept = dept_map.get(category, "Infrastructure")
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute(
        "SELECT * FROM employees WHERE status='available' AND department=? ORDER BY pending ASC LIMIT 1",
        (dept,)
    )
    row = cur.fetchone()
    if not row:
        cur.execute("SELECT * FROM employees ORDER BY pending ASC LIMIT 1")
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
    cur.execute("""
        SELECT * FROM complaints
        WHERE employee_id=? AND status NOT IN ('resolved','rejected')
        ORDER BY
          CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
          sla_deadline ASC
    """, (employee_id,))
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
# Admin stats
# ─────────────────────────────────────────────────────────

def get_overview_stats() -> dict:
    conn   = get_connection()
    cur    = conn.cursor()
    stats  = {}
    for s in ("pending","accepted","in-progress","proof-submitted","resolved",
              "escalated","needs-review","rejected"):
        cur.execute("SELECT COUNT(*) as cnt FROM complaints WHERE status=?", (s,))
        stats[s.replace("-","_")] = cur.fetchone()["cnt"]
    cur.execute("SELECT COUNT(*) as cnt FROM complaints")
    stats["total"] = cur.fetchone()["cnt"]
    cur.execute("SELECT category, COUNT(*) as cnt FROM complaints GROUP BY category ORDER BY cnt DESC")
    stats["by_category"] = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT ai_verified, COUNT(*) as cnt FROM complaints WHERE ai_verified IS NOT NULL GROUP BY ai_verified")
    stats["ai_summary"] = [dict(r) for r in cur.fetchall()]
    conn.close()
    return stats


# ─────────────────────────────────────────────────────────
# Corruption
# ─────────────────────────────────────────────────────────

def insert_corruption_report(data: dict) -> str:
    report_id = "CR-" + str(uuid.uuid4())[:6].upper()
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("""
        INSERT INTO corruption_reports
        (id,official_name,department,amount_demanded,service,description,status,reported_at)
        VALUES (:id,:official_name,:department,:amount_demanded,:service,:description,:status,:reported_at)
    """, {**data, "id": report_id})
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
# Service prices
# ─────────────────────────────────────────────────────────

def get_service_prices() -> list:
    conn = get_connection()
    cur  = conn.cursor()
    cur.execute("SELECT * FROM service_prices")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


init_db()
