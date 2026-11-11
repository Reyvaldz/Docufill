# DocuFill

DocuFill is a personal document-generation application with a FastAPI backend,
SQLite storage, and a React + Vite frontend. Upload an Excel template, review
the fields detected in it, fill in the form, and download a generated copy.

## Configuration

The backend reads environment variables in `backend/app/config.py`:

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATA_DIR` | Parent directory for the SQLite database and application files. The app creates `templates/`, `generated/`, and `attachments/` here. Relative paths are based on the project root. | `project-root/data` |
| `CORS_ORIGINS` | Comma-separated browser origins allowed by CORS. | `*` |
| `MAX_UPLOAD_MB` | Maximum accepted template upload size. Larger files receive HTTP 413. | `10` |

The frontend reads `VITE_API_URL`; it defaults to `/api`, suitable when a reverse
proxy routes `/api` to the backend. Set it to the API's browser-accessible URL
when no such proxy is used. Vite reads this value at build time for production
builds (or when the dev server starts). `.env.example` lists these variables
with dummy example values; copy and adjust it for your deployment environment.

The API and application logs are written to stdout. Health checks are available
at `GET /health` and `GET /api/health`, both returning `{"status":"ok"}`.

## Container deployment

Copy `.env.example` to `.env`, then run:

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f
```

Open `http://localhost:8080` (or the port set by `APP_PORT`). The included
Nginx server serves the production frontend and proxies `/api` and `/health` to
the backend. The backend is not published directly to the host. A named Docker
volume persists the SQLite database, uploaded templates, and
generated files at `DATA_DIR` inside the backend container (default `/data`).
Compose waits for the backend health check before starting the frontend. Set
`CORS_ORIGINS` and `MAX_UPLOAD_MB` in `.env` to override backend defaults; keep
`VITE_API_URL=/api` when using this reverse proxy.

To shut down while retaining data, run `docker compose down`. `docker compose
down -v` also removes the database and generated files.

## Local development

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

The frontend defaults to `/api`. For local development without a reverse proxy,
create `frontend/.env.local` with `VITE_API_URL=http://localhost:8000/api`.
The development UI is available at `http://localhost:5173`.

## Excel template format

The automatic form builder reads the active sheet in `.xlsx` files. Put at
least two adjacent column headers on the first table-header row; rows below it
become repeatable item rows. The app copies the original workbook and fills
these rows, preserving the template formatting and formulas.

To collect document-level information, put labels above the table with an
empty cell immediately to the right, for example `Nama` in A1 and `Departemen`
in C1, leaving B1 and D1 empty. The form shows these labels, and writes answers
into the cells beside them. Item quantities, prices, and other values are
entered as text fields; use **Tambah item** to add rows.

`samples/sample-reimbursement.xlsx` demonstrates this layout. Upload it from
the Template library in the web app, or with the API (the seeded Finance
category has ID `1`):

```bash
curl -F "file=@samples/sample-reimbursement.xlsx" \
  -F "name=Sample Reimbursement" \
  -F "category_id=1" \
  http://localhost:8000/api/templates
```

After upload, select **Use** on the template card. DocuFill analyzes the headers
and document labels before showing the form. It creates a new `.xlsx` copy and
does not modify the uploaded template.

Uploaded templates show their creation date in the template library and can be
removed with the Delete template button or `DELETE /api/templates/{template_id}`.
Removing a template keeps previously generated documents; its file is removed
when no other template references it. Older `.docx` files can remain stored,
but automatic form analysis is for `.xlsx` templates.

Documents in both the recent history and All documents list can be removed with
the Delete button or `DELETE /api/documents/{document_id}`. Their generated DOCX
file is removed only when no other document record references it.

Generated documents and uploaded files belong under `DATA_DIR`; that directory
is ignored by Git and should be mounted to persistent storage in deployments.
