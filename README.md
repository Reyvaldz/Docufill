# DocuFill

DocuFill is a personal document-generation application with a FastAPI backend,
SQLite storage, and a React + Vite frontend. Upload an Excel template, review
the fields detected in it, fill in the form, and download a generated copy.
The interface keeps Dashboard, Templates, Documents, All Documents, and Email
Templates on separate pages accessible from the navigation menu.
Choose **Wallpaper** to select a built-in background or upload a JPG, PNG, or
WebP image. The choice is saved locally in the current browser and is not
uploaded to the backend or shared across devices. Uploaded photos retain their
original color, and the page heading automatically switches text color for
contrast against the selected image.

## Code structure

- `frontend/src/App.jsx` connects the pages, application state, and user actions.
- `frontend/src/components/` contains reusable interface pieces such as the logo,
  document table, and dialog controls.
- `frontend/src/utils/documentHelpers.js` contains shared document-name and date
  helpers.
- `backend/app/main.py` defines the HTTP API; `models.py` and `schemas.py`
  describe stored data and API inputs/outputs.

When changing a feature, start at the page or action in `App.jsx`, then follow
the component or helper it uses. Keep reusable display elements in
`frontend/src/components/` and shared formatting logic in
`frontend/src/utils/`.

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
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
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

The automatic form builder selects the sheet with the clearest table structure
in `.xlsx` files. Put at least two adjacent column headers on the table-header
row; blank cells directly below those headers become repeatable item inputs.
The app copies the original workbook and fills these rows, preserving the
template formatting and formulas.

For document-level information, use labels such as `Nama Karyawan` and
`Nama Departemen / Business Unit` above the table, with a blank cell or merged
input area immediately to the right. `Tgl Pengajuan` and `Tgl Dibutuhkan` are
offered as calendar fields when their adjacent cells are blank. Only recognized
name, purpose, department, and date labels are shown as document information;
other text such as titles, reference numbers, and prefilled values is left
untouched.
Date columns use a calendar picker, and amount columns use numeric inputs so
spreadsheet totals can calculate. Numbering columns such as `No.` are filled
automatically. Columns are offered as item inputs only when the first row below
their header is blank. Use **Tambah item** to add rows, up to the number of
blank rows before the template total row.
If a template column has an Excel list validation, its form field becomes a
dropdown populated from that template's list (including lists stored in named
ranges or another sheet).

If a needed field such as an application date is not detected, open **Templates**
and choose **Edit form template**. First compare the form preview with the Excel
sheet; it shows detected document fields, item columns, and custom fields.
Add any missing field there with its label, blank cell address on the selected
sheet (for example `E6`), and input type, then save the template. These mappings
are stored with the template and appear as value inputs whenever you create a
document from it. Document forms only collect values; they do not add or change
template fields. Generated workbooks also retain the mappings for editing or
copying existing documents.

Generated Excel documents can be reopened with **Edit** or started as a
pre-filled **Copy** from either document list. Editing updates the existing
generated file; copying creates a separate document and file.

When creating a new Excel document in the browser, enter a folder name and
optionally select JPG, PNG, or WebP documentation/realization photos. DocuFill
stores the folder and its files in the application's `DATA_DIR`; it does not
request access to a folder on the user's device. Each folder can be downloaded
from **Documents** as a ZIP containing the Excel file and selected photos.
Uploads allow up to 10 photos, 8 MB each and 30 MB total. The Excel filename
uses `Pengajuan (tujuan) - (nama) (DDMMYYYY).xlsx`, for example
`Pengajuan Reimbursement - Reyval Danendra 06112026.xlsx`.

After creation, DocuFill opens a review step with the Excel fields, item rows,
and photo previews. Continue to the email step without downloading first; use
the adjacent **Unduh folder** action when you want the ZIP. Choose saved
recipients, an optional email template, a subject, and an editable message.
Editing a generated folder also lets you append multiple photos, within the
same per-folder upload limits.
Email templates are separate from Excel document templates. The
`{document_name}` subject token fills with the generated pengajuan name, such as
`Pengajuan Reimbursement - Reyval Danendra 06112026`. Manage recipient addresses
and email templates from the **Templates Email** tab in **Templates**.
**Buka aplikasi email** opens the user's configured mail app with the selected
recipients, subject, and message; attach the downloaded ZIP manually before
sending. This flow does not store or request email credentials.

DocuFill currently has no user sign-in. Docker Compose binds to `127.0.0.1` by
default; set `APP_BIND_ADDRESS` only if you intentionally need network access
and have protected the app with suitable network controls and authentication.

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
