# DocuFill

DocuFill is a document-generation application with a FastAPI backend, SQLite
storage, and a React + Vite frontend.

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
named Docker volume persists the SQLite database, uploaded templates, and
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

## Sample template

`samples/sample-reimbursement.docx` is a small, synthetic template containing
placeholders such as `{{ nama }}` and `{{ nominal }}`. Upload it through the
existing template endpoint (the seeded Finance category has ID `1`):

```bash
curl -F "file=@samples/sample-reimbursement.docx" \
  -F "name=Sample Reimbursement" \
  -F "category_id=1" \
  http://localhost:8000/api/templates
```

Uploaded templates show their creation date in the template library and can be
removed with the Delete template button or `DELETE /api/templates/{template_id}`.
Removing a template keeps previously generated documents; its stored DOCX file
is removed when no other template references it.

Generated documents and uploaded files belong under `DATA_DIR`; that directory
is ignored by Git and should be mounted to persistent storage in deployments.
