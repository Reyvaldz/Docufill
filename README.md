# DocuFill

DocuFill is a lightweight internal document automation application for generating employee forms from templates. It includes a FastAPI backend, SQLite storage, and a React + Tailwind frontend.

## Stack

- Frontend: React.js, Tailwind CSS, Vite
- Backend: FastAPI + Pydantic
- Database: SQLite
- Document processing: python-docx, docxtpl, openpyxl

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

### Docker Compose

```bash
docker compose up --build
```

The frontend is available on http://localhost:5173 and the API on http://localhost:8000/api.
