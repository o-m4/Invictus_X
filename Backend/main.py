"""
main.py — Smart Public Service CRM Backend
FastAPI application with all endpoints.

Run:
    pip install fastapi uvicorn python-multipart
    uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timedelta
import database as db
import ai_module as ai

app = FastAPI(title="Smart Public Service CRM", version="1.0.0")

# Allow frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend files at /
app.mount("/static", StaticFiles(directory="frontend"), name="frontend")

# ─────────────────────────────────────────────────────────
# Pydantic Models (Request / Response schemas)
# ─────────────────────────────────────────────────────────

class CitizenRequest(BaseModel):
    name: str
    phone: str
    location: str
    description: str
    category: str                   # e.g. "Road Damage", "Garbage"
    request_type: str               # "complaint" or "service"
    image_base64: Optional[str] = None  # optional photo from citizen

class StatusUpdate(BaseModel):
    complaint_id: str
    new_status: str                 # pending / in-progress / resolved / escalated
    progress: Optional[int] = None  # 0-100
    employee_note: Optional[str] = None

class CorruptionReport(BaseModel):
    official_name: Optional[str] = None
    department: str
    amount_demanded: str
    service: str
    description: Optional[str] = None

# ─────────────────────────────────────────────────────────
# Citizen Endpoints
# ─────────────────────────────────────────────────────────

@app.post("/api/complaints/submit")
def submit_complaint(request: CitizenRequest):
    """
    Citizen submits a complaint or service request.
    AI module analyzes it, assigns priority and nearest employee.
    """
    # AI analysis
    analysis = ai.analyze_complaint(request.description, request.category)

    # Find best available employee
    employee = db.get_best_employee(request.location, request.category)

    # Calculate SLA deadline
    sla_days = {"critical": 1, "high": 2, "medium": 4, "low": 7}
    days = sla_days.get(analysis["priority"], 3)
    sla_date = (datetime.now() + timedelta(days=days)).date().isoformat()

    # Save to database
    complaint_id = db.insert_complaint({
        "name":         request.name,
        "phone":        request.phone,
        "location":     request.location,
        "description":  request.description,
        "category":     request.category,
        "request_type": request.request_type,
        "priority":     analysis["priority"],
        "assigned_to":  employee["name"] if employee else None,
        "employee_id":  employee["id"] if employee else None,
        "sla_deadline": sla_date,
        "status":       "pending",
        "progress":     0,
        "submitted_at": datetime.now().isoformat(),
    })

    return {
        "complaint_id": complaint_id,
        "status":       "pending",
        "priority":     analysis["priority"],
        "assigned_to":  employee["name"] if employee else "Pending assignment",
        "department":   employee["department"] if employee else "",
        "sla_deadline": sla_date,
        "ai_confidence": analysis["confidence"],
        "message":      "Your complaint has been registered and assigned."
    }


@app.get("/api/complaints/track/{complaint_id}")
def track_complaint(complaint_id: str):
    """Citizen tracks their complaint by ID."""
    complaint = db.get_complaint(complaint_id)
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found.")
    return complaint


@app.get("/api/citizen/{phone}/requests")
def citizen_requests(phone: str):
    """Return all complaints / service requests filed by a citizen (by phone)."""
    return db.get_requests_by_phone(phone)

# ─────────────────────────────────────────────────────────
# Employee Endpoints
# ─────────────────────────────────────────────────────────

@app.get("/api/employee/{employee_id}/tasks")
def employee_tasks(employee_id: str):
    """Return all tasks assigned to a specific employee."""
    tasks = db.get_employee_tasks(employee_id)
    if tasks is None:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return tasks


@app.put("/api/complaints/update-status")
def update_status(update: StatusUpdate):
    """Employee updates the status and progress of a complaint."""
    success = db.update_complaint_status(
        update.complaint_id,
        update.new_status,
        update.progress,
        update.employee_note
    )
    if not success:
        raise HTTPException(status_code=404, detail="Complaint not found.")

    # Auto-escalate if SLA breached
    complaint = db.get_complaint(update.complaint_id)
    if complaint and complaint["sla_deadline"] < date.today().isoformat():
        if update.new_status not in ("resolved",):
            db.update_complaint_status(update.complaint_id, "escalated", update.progress)
            return {"message": "Status updated. Complaint escalated due to SLA breach."}

    return {"message": "Status updated successfully."}

# ─────────────────────────────────────────────────────────
# Admin Endpoints
# ─────────────────────────────────────────────────────────

@app.get("/api/admin/overview")
def admin_overview():
    """Returns high-level statistics for the admin dashboard."""
    return db.get_overview_stats()


@app.get("/api/admin/complaints")
def all_complaints(status: Optional[str] = None, category: Optional[str] = None):
    """Returns all complaints, with optional filters."""
    return db.get_all_complaints(status=status, category=category)


@app.get("/api/admin/employees")
def all_employees():
    """Returns all employees with their performance data."""
    return db.get_all_employees()

# ─────────────────────────────────────────────────────────
# Corruption Reporting
# ─────────────────────────────────────────────────────────

@app.post("/api/corruption/report")
def report_corruption(report: CorruptionReport):
    """Anonymous corruption report. No identity is stored."""
    report_id = db.insert_corruption_report({
        "official_name":    report.official_name or "Anonymous",
        "department":       report.department,
        "amount_demanded":  report.amount_demanded,
        "service":          report.service,
        "description":      report.description or "",
        "reported_at":      datetime.now().isoformat(),
        "status":           "under_review"
    })
    return {
        "report_id": report_id,
        "message":   "Report submitted anonymously to the Vigilance Department."
    }


@app.get("/api/admin/corruption-reports")
def corruption_reports():
    return db.get_corruption_reports()

# ─────────────────────────────────────────────────────────
# Services / Pricing
# ─────────────────────────────────────────────────────────

@app.get("/api/services/pricing")
def service_pricing():
    """Returns official government service prices."""
    return db.get_service_prices()
