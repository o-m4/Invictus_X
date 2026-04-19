"""
main.py — Smart Civic Service Platform Backend v2.1
All bugs fixed — see FIX comments throughout.

Run:
    pip install fastapi uvicorn python-multipart
    uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta, date
import database as db
import ai_module as ai

app = FastAPI(title="Smart Civic Service Platform", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────
# Pydantic models
# ─────────────────────────────────────────────────────────

class CitizenRequest(BaseModel):
    name:          str
    phone:         str
    location:      str
    description:   str
    category:      str
    request_type:  str
    citizen_image: Optional[str] = None

class StatusUpdate(BaseModel):
    complaint_id:  str
    new_status:    str
    progress:      Optional[int] = None
    employee_note: Optional[str] = None

class AcceptTask(BaseModel):
    complaint_id: str
    employee_id:  str
    deadline:     str

class ProofSubmission(BaseModel):
    complaint_id: str
    proof_note:   str
    proof_image:  Optional[str] = None

class CorruptionReport(BaseModel):
    official_name:   Optional[str] = None
    department:      str
    amount_demanded: str
    service:         str
    description:     Optional[str] = None

# FIX: New model for chat messages
class ChatMessage(BaseModel):
    complaint_id: str
    sender_role:  str   # 'citizen' | 'employee'
    sender_name:  str
    message_text: str
    message_type: Optional[str] = "text"


# ─────────────────────────────────────────────────────────
# CITIZEN ENDPOINTS
# ─────────────────────────────────────────────────────────

@app.post("/api/complaints/submit")
def submit_complaint(req: CitizenRequest):
    """Step 1 — Citizen submits. AI assigns priority, employee auto-selected."""

    # FIX: Normalize request_type — frontend may send 'service' or 'complaint'
    req.request_type = req.request_type.lower().strip()
    if req.request_type not in ("complaint", "service"):
        req.request_type = "complaint"

    analysis = ai.analyze_complaint(req.description, req.category)
    employee = db.get_best_employee(req.location, req.category)

    sla_days = ai.get_sla_days(analysis["priority"])
    sla_date = (datetime.now() + timedelta(days=sla_days)).date().isoformat()

    complaint_id = db.insert_complaint({
        "name":          req.name,
        "phone":         req.phone,
        "location":      req.location,
        "description":   req.description,
        "category":      req.category,
        "request_type":  req.request_type,
        "priority":      analysis["priority"],
        "assigned_to":   employee["name"] if employee else None,
        "employee_id":   employee["id"]   if employee else None,
        "sla_deadline":  sla_date,
        "status":        "pending",
        "progress":      0,
        "citizen_image": req.citizen_image,
        "submitted_at":  datetime.now().isoformat(),
    })

    db.push_event("new_complaint", complaint_id, {
        "id":          complaint_id,
        "category":    req.category,
        "priority":    analysis["priority"],
        "location":    req.location,
        "description": req.description[:100],
        "name":        req.name,
        "phone":       req.phone,
        "assigned_to": employee["name"] if employee else None,
        "employee_id": employee["id"]   if employee else None,
        "sla_deadline": sla_date,
    })

    return {
        "complaint_id":  complaint_id,
        "status":        "pending",
        "priority":      analysis["priority"],
        "assigned_to":   employee["name"]       if employee else "Unassigned",
        "department":    employee["department"] if employee else "",
        "sla_deadline":  sla_date,
        "ai_confidence": analysis["confidence"],
        "message":       "Complaint registered successfully.",
    }


@app.get("/api/complaints/track/{complaint_id}")
def track_complaint(complaint_id: str):
    """Citizen or employee tracks a single complaint by ID."""
    c = db.get_complaint(complaint_id)
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    return c


@app.get("/api/citizen/{phone}/requests")
def citizen_requests(phone: str):
    """All complaints for a citizen by phone. Used by activity page."""
    return db.get_requests_by_phone(phone)


# ─────────────────────────────────────────────────────────
# EMPLOYEE ENDPOINTS
# FIX: Static routes MUST come before parameterised routes in FastAPI
# /api/employee/queue/pending was being swallowed by /api/employee/{employee_id}/tasks
# ─────────────────────────────────────────────────────────

@app.get("/api/employee/queue/pending")
def pending_queue():
    """
    FIX: Moved ABOVE /{employee_id}/tasks to avoid route shadowing.
    Returns all pending (unaccepted) complaints sorted by priority.
    """
    return db.get_pending_complaints()


@app.get("/api/employee/{employee_id}/tasks")
def employee_tasks(employee_id: str):
    """All active tasks assigned to this employee."""
    # FIX: 'queue' would previously match here — now prevented by route order
    if employee_id == "queue":
        raise HTTPException(status_code=400, detail="Invalid employee ID 'queue'.")
    tasks = db.get_employee_tasks(employee_id)
    if tasks is None:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return tasks


@app.post("/api/complaints/accept")
def accept_task(body: AcceptTask):
    """Step 3 — Employee accepts complaint, sets deadline. pending → accepted."""
    ok = db.accept_complaint(body.complaint_id, body.employee_id, body.deadline)
    if not ok:
        # FIX: Return the current complaint state so frontend can sync
        existing = db.get_complaint(body.complaint_id)
        if existing:
            return {
                "message":  "Already accepted or in progress.",
                "complaint": existing,
                "deadline":  existing.get("deadline_custom", body.deadline),
            }
        raise HTTPException(status_code=404, detail="Complaint not found.")

    db.push_event("status_change", body.complaint_id, {
        "complaint_id": body.complaint_id,
        "status":       "accepted",
        "employee_id":  body.employee_id,
        "deadline":     body.deadline,
    })
    # Return full complaint so frontend can render the task card
    complaint = db.get_complaint(body.complaint_id)
    return {"message": "Task accepted.", "deadline": body.deadline, "complaint": complaint}


@app.put("/api/complaints/update-status")
def update_status(update: StatusUpdate):
    """Step 5 — Employee updates status/progress. Handles SLA escalation."""
    # FIX: Validate complaint_id exists before updating
    existing = db.get_complaint(update.complaint_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Complaint not found.")

    ok = db.update_complaint_status(
        update.complaint_id, update.new_status,
        update.progress, update.employee_note
    )
    if not ok:
        raise HTTPException(status_code=500, detail="Update failed.")

    db.push_event("status_change", update.complaint_id, {
        "complaint_id": update.complaint_id,
        "status":       update.new_status,
        "progress":     update.progress,
    })

    # Auto-escalate on SLA breach (not for terminal states)
    c = db.get_complaint(update.complaint_id)
    if c and c.get("sla_deadline") and update.new_status not in ("resolved", "proof-submitted", "escalated"):
        if c["sla_deadline"] < date.today().isoformat():
            db.update_complaint_status(update.complaint_id, "escalated", update.progress)
            db.push_event("status_change", update.complaint_id, {
                "complaint_id": update.complaint_id,
                "status":       "escalated",
                "progress":     update.progress,
            })
            return {"message": "Status updated. Escalated — SLA breached.", "escalated": True}

    return {"message": "Status updated.", "escalated": False}


@app.post("/api/complaints/submit-proof")
def submit_proof(body: ProofSubmission):
    """Step 6+7+8 — Employee submits proof, AI verifies, result saved."""
    c = db.get_complaint(body.complaint_id)
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found.")

    # FIX: Save proof first, then run AI — original code had timing risk
    ok = db.submit_proof(body.complaint_id, body.proof_note, body.proof_image)
    if not ok:
        raise HTTPException(status_code=500, detail="Could not save proof.")

    db.push_event("proof_submitted", body.complaint_id, {
        "complaint_id": body.complaint_id,
        "has_image":    bool(body.proof_image),
    })

    # Run AI verification
    result = ai.verify_proof(
        complaint_description = c["description"],
        complaint_category    = c["category"],
        proof_note            = body.proof_note,
        proof_image           = body.proof_image,
        submitted_at          = datetime.now().isoformat(),
        sla_deadline          = c.get("sla_deadline"),
    )

    # Image boost
    if body.proof_image:
        img = ai.analyze_image(body.proof_image, c["category"])
        result["confidence"] = min(result["confidence"] + img["boost"], 100)
        if result["confidence"] >= 60 and result["verdict"] == "needs-review":
            result["verdict"] = "verified"

    # Save AI result
    db.save_ai_verification(
        body.complaint_id,
        result["verdict"],
        result["confidence"],
        result["reason"],
    )

    db.push_event("ai_result", body.complaint_id, {
        "complaint_id": body.complaint_id,
        "verdict":      result["verdict"],
        "confidence":   result["confidence"],
        "reason":       result["reason"],
    })

    return {
        "message":       "Proof submitted. AI verification complete.",
        "ai_verdict":    result["verdict"],
        "ai_confidence": result["confidence"],
        "ai_reason":     result["reason"],
        "signals":       result.get("signals", {}),
    }


# ─────────────────────────────────────────────────────────
# CHAT ENDPOINTS — FIX: Completely new, replaces localStorage-only system
# ─────────────────────────────────────────────────────────

@app.post("/api/chat/send")
def send_chat_message(msg: ChatMessage):
    """Send a message. Saves to DB and pushes event for real-time delivery."""
    # Validate complaint exists
    c = db.get_complaint(msg.complaint_id)
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found.")

    saved = db.save_message(
        msg.complaint_id,
        msg.sender_role,
        msg.sender_name,
        msg.message_text,
        msg.message_type,
    )

    # Push event so other side polls it immediately
    db.push_event("new_message", msg.complaint_id, {
        "complaint_id": msg.complaint_id,
        "sender_role":  msg.sender_role,
        "message_id":   saved["id"],
        "preview":      msg.message_text[:60],
    })

    return saved


@app.get("/api/chat/{complaint_id}/messages")
def get_chat_messages(complaint_id: str, since_id: int = 0):
    """
    Fetch messages for a conversation.
    Pass since_id for incremental polling — returns only new messages.
    """
    c = db.get_complaint(complaint_id)
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    msgs = db.get_messages(complaint_id, since_id)
    return {"messages": msgs, "complaint_id": complaint_id}


@app.post("/api/chat/{complaint_id}/read")
def mark_read(complaint_id: str, role: str = "citizen"):
    """Mark all messages in this conversation as read for the given role."""
    db.mark_messages_read(complaint_id, role)
    return {"ok": True}


@app.get("/api/chat/conversations/employee/{employee_id}")
def employee_conversations(employee_id: str):
    """All conversations for an employee with unread counts."""
    return db.get_conversations_for_employee(employee_id)


@app.get("/api/chat/conversations/citizen/{phone}")
def citizen_conversations(phone: str):
    """All conversations for a citizen phone number with unread counts."""
    return db.get_conversations_for_citizen(phone)


# ─────────────────────────────────────────────────────────
# POLLING BUS
# ─────────────────────────────────────────────────────────

@app.get("/api/events/poll")
def poll_events(since_id: int = 0):
    """
    Frontend calls every 4s with last received event ID.
    Returns only new events — zero DB load when nothing changed.
    """
    events    = db.get_events_since(since_id)
    latest_id = db.get_latest_event_id()
    return {"events": events, "latest_id": latest_id}


# ─────────────────────────────────────────────────────────
# ADMIN
# ─────────────────────────────────────────────────────────

@app.get("/api/admin/overview")
def admin_overview():
    return db.get_overview_stats()


@app.get("/api/admin/complaints")
def all_complaints(status: Optional[str] = None, category: Optional[str] = None):
    return db.get_all_complaints(status=status, category=category)


@app.get("/api/admin/employees")
def all_employees():
    return db.get_all_employees()


# ─────────────────────────────────────────────────────────
# CORRUPTION
# ─────────────────────────────────────────────────────────

@app.post("/api/corruption/report")
def report_corruption(report: CorruptionReport):
    report_id = db.insert_corruption_report({
        "official_name":   report.official_name or "Anonymous",
        "department":      report.department,
        "amount_demanded": report.amount_demanded,
        "service":         report.service,
        "description":     report.description or "",
        "reported_at":     datetime.now().isoformat(),
        "status":          "under_review",
    })
    return {"report_id": report_id, "message": "Report submitted to Vigilance Department."}


@app.get("/api/admin/corruption-reports")
def corruption_reports():
    return db.get_corruption_reports()


@app.get("/api/employee/profile/{employee_id}")
def get_employee_profile(employee_id: str):
    emp = db.get_employee(employee_id)
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    return {
        "id": emp["id"],
        "name": emp["name"],
        "department": emp.get("department", "General"),
        "resolved": emp.get("resolved", 0),
        "pending": emp.get("pending", 0),
        "rating": emp.get("rating", 4.2),
        "total": emp.get("resolved", 0) + emp.get("pending", 0)
    }


# ─────────────────────────────────────────────────────────
# SERVICES
# ─────────────────────────────────────────────────────────

@app.get("/api/services/pricing")
def service_pricing():
    return db.get_service_prices()

@app.get("/api/employees/leaderboard")
def leaderboard(city: str, employee_id: Optional[str] = None):
    employees = db.get_all_employees()

    # filter by city
    filtered = [e for e in employees if city.lower() in (e.get("location") or "").lower()]

    # ranking logic
    ranked = sorted(
        filtered,
        key=lambda x: (-x.get("resolved", 0), -x.get("rating", 0), x.get("pending", 0))
    )

    # assign rank
    for i, e in enumerate(ranked):
        e["rank"] = i + 1

    top20 = ranked[:20]

    current = None
    if employee_id:
        for e in ranked:
            if e["id"] == employee_id:
                current = e
                break

    return {
        "top": top20,
        "current_user": current
    }