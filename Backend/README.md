# Smart Public Service CRM
# AI-Powered Citizen Complaint & Accountability Platform
# Team: Invictus X — KCC Institute of Technology and Management

## Project Structure

```
smart-crm/
│
├── frontend/
│   ├── index.html          — Landing page (portal selection)
│   ├── citizen.html        — Citizen portal (services + report issues)
│   ├── activity.html       — Track complaints / service requests
│   ├── employee.html       — Employee task management
│   ├── admin.html          — Admin dashboard
│   ├── profile.html        — Citizen profile
│   │
│   ├── css/
│   │   ├── style.css       — Global styles
│   │   ├── citizen.css     — Citizen portal styles
│   │   ├── activity.css    — Activity/tracking page styles
│   │   ├── employee.css    — Employee portal styles
│   │   └── admin.css       — Admin dashboard styles
│   │
│   └── js/
│       ├── citizen.js      — Citizen form logic + search
│       ├── activity.js     — Dynamic complaint tracker
│       ├── employee.js     — Task update logic
│       └── admin.js        — Admin section navigation + filters
│
└── backend/
    ├── main.py             — FastAPI application (all API routes)
    ├── database.py         — SQLite CRUD operations
    ├── ai_module.py        — AI priority/category classification
    ├── smart_crm.sql       — Database schema + seed data
    └── requirements.txt    — Python dependencies
```

## Running the Frontend (No server needed)

Just open `frontend/index.html` in a browser directly.
The frontend works standalone using localStorage for demo data.

## Running the Backend (Python API)

### 1. Install dependencies
```
pip install fastapi uvicorn python-multipart
```

### 2. Start the server
```
cd backend
uvicorn main:app --reload --port 8000
```

### 3. API will be available at
```
http://localhost:8000
Interactive docs: http://localhost:8000/docs
```

## Key API Endpoints

| Method | Endpoint                              | Description                        |
|--------|---------------------------------------|------------------------------------|
| POST   | /api/complaints/submit                | Submit a new complaint/service req |
| GET    | /api/complaints/track/{id}            | Track complaint by ID              |
| PUT    | /api/complaints/update-status         | Employee updates complaint status  |
| GET    | /api/employee/{id}/tasks              | Get tasks assigned to employee     |
| GET    | /api/admin/overview                   | Admin dashboard stats              |
| GET    | /api/admin/complaints                 | All complaints (filterable)        |
| GET    | /api/admin/employees                  | All employees + performance        |
| POST   | /api/corruption/report                | Anonymous corruption report        |
| GET    | /api/services/pricing                 | Official service pricing           |

## Database

SQLite database `smart_crm.db` is auto-created and seeded on first run.
To reset manually:
```
cd backend
sqlite3 smart_crm.db < smart_crm.sql
```

## Team

- Om Yadav (Lead) — Backend & AI Integration
- Priyanshu Tiwari — Support Development
- Himanshi Verma — Frontend Development
- Mohit Kumar — Data Management
