from __future__ import annotations

import shutil
import logging
import json
import re
import smtplib
import ssl
import tempfile
import uuid
from datetime import datetime
from email.message import EmailMessage
from io import BytesIO
from logging.config import dictConfig
from pathlib import Path
from urllib.parse import quote
from zipfile import BadZipFile, ZIP_DEFLATED, ZipFile

from docxtpl import DocxTemplate
from docx import Document as DocxDocument
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session

from .config import (
    CORS_ORIGINS,
    EMAIL_FROM,
    EMAIL_SMTP_HOST,
    EMAIL_SMTP_PASSWORD,
    EMAIL_SMTP_PORT,
    EMAIL_SMTP_USERNAME,
    GENERATED_DIR,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_MB,
    TEMPLATE_DIR,
)
from .database import Base, SessionLocal, engine
from .models import Category, DocumentRecord, EmailRecipient, EmailTemplate, Template
from .seed import seed_database
from .spreadsheets import (
    analyze_spreadsheet,
    extract_spreadsheet_data,
    generate_spreadsheet,
)

dictConfig(
    {
        'version': 1,
        'disable_existing_loggers': False,
        'formatters': {
            'default': {'format': '%(asctime)s %(levelname)s %(name)s: %(message)s'},
        },
        'handlers': {
            'stdout': {
                'class': 'logging.StreamHandler',
                'formatter': 'default',
                'stream': 'ext://sys.stdout',
            },
        },
        'root': {'level': 'INFO', 'handlers': ['stdout']},
        'loggers': {
            'uvicorn': {'level': 'INFO', 'handlers': ['stdout'], 'propagate': False},
            'uvicorn.error': {'level': 'INFO', 'handlers': ['stdout'], 'propagate': False},
            'uvicorn.access': {'level': 'INFO', 'handlers': ['stdout'], 'propagate': False},
        },
    }
)

app = FastAPI(title='DocuFill API', version='1.0.0')
logger = logging.getLogger(__name__)
MAX_FOLDER_PHOTOS = 10
MAX_FOLDER_PHOTO_BYTES = 8 * 1024 * 1024
MAX_FOLDER_PHOTOS_TOTAL_BYTES = 30 * 1024 * 1024
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event('startup')
def startup_event() -> None:
    Base.metadata.create_all(bind=engine)
    template_columns = {column['name'] for column in inspect(engine).get_columns('templates')}
    if 'custom_fields' not in template_columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE templates ADD COLUMN custom_fields TEXT NOT NULL DEFAULT '[]'")
            )
    document_columns = {column['name'] for column in inspect(engine).get_columns('documents')}
    if 'folder_name' not in document_columns:
        with engine.begin() as connection:
            connection.execute(text('ALTER TABLE documents ADD COLUMN folder_name VARCHAR(120)'))
    seed_database(SessionLocal())


@app.get('/api/health')
@app.get('/health')
def health_check() -> dict:
    return {'status': 'ok'}


@app.get('/api/categories')
def list_categories(db: Session = Depends(get_db)) -> list[dict]:
    categories = db.query(Category).order_by(Category.id).all()
    return [
        {
            'id': category.id,
            'name': category.name,
            'description': category.description,
            'template_count': len(category.templates),
        }
        for category in categories
    ]


@app.get('/api/templates')
def list_templates(db: Session = Depends(get_db)) -> list[dict]:
    templates = db.query(Template).order_by(Template.created_at.desc()).all()
    return [
        {
            'id': template.id,
            'name': template.name,
            'category_id': template.category_id,
            'category_name': template.category.name if template.category else None,
            'description': template.description,
            'status': template.status,
            'version': template.version,
            'file_name': template.file_name,
            'custom_fields': json.loads(template.custom_fields or '[]'),
            'created_at': template.created_at.isoformat() if template.created_at else None,
        }
        for template in templates
    ]


@app.post('/api/templates')
async def upload_template(
    file: UploadFile = File(...),
    name: str = Form(...),
    category_id: int = Form(...),
    description: str = Form(''),
    version: str = Form('1.0'),
    db: Session = Depends(get_db),
) -> dict:
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail='Category not found')

    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f'Template file exceeds the maximum allowed size of {MAX_UPLOAD_MB} MB',
        )

    safe_name = Path((file.filename or '').replace('\\', '/')).name
    if not safe_name:
        raise HTTPException(status_code=400, detail='Template file name is required')
    if Path(safe_name).suffix.lower() not in {'.xlsx', '.docx'}:
        raise HTTPException(status_code=415, detail='Template harus berupa file .xlsx atau .docx')
    target_path = TEMPLATE_DIR / safe_name
    with target_path.open('wb') as buffer:
        shutil.copyfileobj(file.file, buffer)

    template = Template(
        name=name,
        category_id=category.id,
        description=description,
        status='active',
        version=version,
        file_name=safe_name,
    )
    db.add(template)
    db.commit()
    db.refresh(template)

    return {
        'id': template.id,
        'name': template.name,
        'category_id': template.category_id,
        'file_name': template.file_name,
        'version': template.version,
    }


@app.patch('/api/templates/{template_id}')
def update_template_fields(template_id: int, payload: dict, db: Session = Depends(get_db)) -> dict:
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail='Template not found')
    if not template.file_name or Path(template.file_name).suffix.lower() != '.xlsx':
        raise HTTPException(status_code=415, detail='Pengaturan form hanya tersedia untuk template .xlsx.')

    custom_fields = payload.get('custom_fields')
    if not isinstance(custom_fields, list) or len(custom_fields) > 40:
        raise HTTPException(status_code=422, detail='Daftar informasi tambahan tidak valid (maksimal 40).')

    template_path = (TEMPLATE_DIR / template.file_name).resolve()
    if not template_path.is_relative_to(TEMPLATE_DIR.resolve()) or not template_path.is_file():
        raise HTTPException(status_code=404, detail='Template file not found')

    try:
        analysis = analyze_spreadsheet(template_path)
        with tempfile.TemporaryDirectory() as temp_dir:
            validation_path = Path(temp_dir) / 'template-validation.xlsx'
            generate_spreadsheet(
                template_path,
                validation_path,
                analysis,
                {},
                [{}],
                custom_fields,
            )
        normalized_fields = [
            {
                'key': str(field.get('key') or f'custom_{index}'),
                'label': str(field.get('label', '')).strip(),
                'cell': str(field.get('cell', '')).strip().upper(),
                'input_type': field.get('input_type', 'text'),
            }
            for index, field in enumerate(custom_fields, start=1)
        ]
    except (OSError, ValueError, InvalidFileException, BadZipFile) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    template.custom_fields = json.dumps(normalized_fields, ensure_ascii=False)
    db.commit()
    return {'id': template.id, 'custom_fields': normalized_fields}


@app.delete('/api/templates/{template_id}')
def delete_template(template_id: int, db: Session = Depends(get_db)) -> dict:
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail='Template not found')

    should_delete_file = bool(
        template.file_name
        and not db.query(Template)
        .filter(Template.file_name == template.file_name, Template.id != template.id)
        .first()
    )
    file_path = (TEMPLATE_DIR / template.file_name).resolve() if should_delete_file else None
    template_dir = TEMPLATE_DIR.resolve()
    if file_path and file_path.is_relative_to(template_dir) and file_path.is_file():
        file_path.unlink()

    db.delete(template)
    db.commit()
    return {'message': 'Template deleted successfully'}


@app.get('/api/templates/{template_id}/analysis')
def analyze_template(template_id: int, db: Session = Depends(get_db)) -> dict:
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail='Template not found')
    if not template.file_name or Path(template.file_name).suffix.lower() != '.xlsx':
        raise HTTPException(status_code=415, detail='Analisis otomatis saat ini mendukung template .xlsx.')

    template_path = (TEMPLATE_DIR / template.file_name).resolve()
    if not template_path.is_relative_to(TEMPLATE_DIR.resolve()) or not template_path.is_file():
        raise HTTPException(status_code=404, detail='Template file not found')

    try:
        analysis = analyze_spreadsheet(template_path)
        analysis['custom_fields'] = json.loads(template.custom_fields or '[]')
        return analysis
    except (OSError, ValueError, InvalidFileException, BadZipFile) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@app.get('/api/documents')
def list_documents(db: Session = Depends(get_db)) -> list[dict]:
    documents = db.query(DocumentRecord).order_by(DocumentRecord.created_at.desc()).all()
    return [
        {
            'id': document.id,
            'name': document.name,
            'category': document.category,
            'template_name': document.template_name,
            'template_version': document.template_version,
            'created_by': document.created_by,
            'created_at': document.created_at.isoformat() if document.created_at else None,
            'status': document.status,
            'file_path': document.file_path,
            'folder_name': document.folder_name,
        }
        for document in documents
    ]


@app.delete('/api/documents/{document_id}')
def delete_document(document_id: int, db: Session = Depends(get_db)) -> dict:
    document = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')

    file_path = None
    file_prefix = '/api/files/'
    if document.file_path and document.file_path.startswith(file_prefix):
        file_name = document.file_path.removeprefix(file_prefix)
        candidate = (GENERATED_DIR / file_name).resolve()
        generated_dir = GENERATED_DIR.resolve()
        file_is_referenced = (
            db.query(DocumentRecord)
            .filter(
                DocumentRecord.file_path == document.file_path,
                DocumentRecord.id != document.id,
            )
            .first()
        )
        if not file_is_referenced and candidate.is_relative_to(generated_dir):
            file_path = candidate

    db.delete(document)
    db.commit()

    if file_path and file_path.is_file():
        try:
            file_path.unlink()
        except OSError as error:
            logger.exception('Could not remove generated file %s', file_path)
            raise HTTPException(
                status_code=500,
                detail='Document was deleted, but its generated file could not be removed.',
            ) from error

    folder_path = (GENERATED_DIR / f'document-{document.id}').resolve()
    if folder_path.is_relative_to(GENERATED_DIR.resolve()) and folder_path.is_dir():
        try:
            shutil.rmtree(folder_path)
        except OSError as error:
            logger.exception('Could not remove document folder %s', folder_path)
            raise HTTPException(
                status_code=500,
                detail='Document was deleted, but its photos could not be removed.',
            ) from error

    return {'message': 'Document deleted successfully'}


def _spreadsheet_document_source(document: DocumentRecord, db: Session):
    file_prefix = '/api/files/'
    if not document.file_path or not document.file_path.startswith(file_prefix):
        raise HTTPException(status_code=415, detail='Dokumen ini bukan file Excel yang bisa diedit.')

    generated_name = document.file_path.removeprefix(file_prefix)
    if Path(generated_name).name != generated_name:
        raise HTTPException(status_code=404, detail='Generated document not found')
    output_path = (GENERATED_DIR / generated_name).resolve()
    generated_dir = GENERATED_DIR.resolve()
    if not output_path.is_relative_to(generated_dir) or not output_path.is_file():
        raise HTTPException(status_code=404, detail='Generated document not found')

    template = (
        db.query(Template).filter(Template.id == document.template_id).first()
        if document.template_id is not None
        else None
    )
    source_path = output_path
    if template and template.file_name:
        candidate = (TEMPLATE_DIR / template.file_name).resolve()
        if candidate.is_relative_to(TEMPLATE_DIR.resolve()) and candidate.is_file():
            source_path = candidate

    analysis = analyze_spreadsheet(
        source_path,
        include_existing_fields=source_path == output_path,
    )
    data = extract_spreadsheet_data(output_path, analysis)
    return template, source_path, output_path, analysis, data


def _write_spreadsheet_document(
    source_path: Path,
    output_path: Path,
    analysis: dict,
    payload: dict,
) -> None:
    temporary_path = output_path.with_name(f'.{uuid.uuid4().hex}.tmp.xlsx')
    try:
        generate_spreadsheet(
            source_path,
            temporary_path,
            analysis,
            payload.get('fields', {}),
            payload.get('items', []),
            payload.get('custom_fields', []),
        )
        temporary_path.replace(output_path)
    finally:
        if temporary_path.exists():
            temporary_path.unlink()


@app.get('/api/documents/{document_id}/form')
def get_document_form(document_id: int, db: Session = Depends(get_db)) -> dict:
    document = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    try:
        template, _, _, analysis, data = _spreadsheet_document_source(document, db)
    except (OSError, ValueError, InvalidFileException, BadZipFile) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {
        'id': document.id,
        'name': document.name,
        'template_id': document.template_id,
        'template_name': template.name if template else document.template_name,
        'analysis': analysis,
        **data,
    }


@app.put('/api/documents/{document_id}')
def update_document(document_id: int, payload: dict, db: Session = Depends(get_db)) -> dict:
    document = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    try:
        _, source_path, output_path, analysis, _ = _spreadsheet_document_source(document, db)
        _write_spreadsheet_document(source_path, output_path, analysis, payload)
    except (OSError, ValueError, InvalidFileException, BadZipFile) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    document.name = str(payload.get('name') or document.name)
    db.commit()
    return {
        'id': document.id,
        'name': document.name,
        'file_path': document.file_path,
        'message': 'Document updated successfully.',
    }


@app.post('/api/documents/{document_id}/copy')
def copy_document(document_id: int, payload: dict, db: Session = Depends(get_db)) -> dict:
    document = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail='Document not found')
    try:
        template, source_path, _, analysis, _ = _spreadsheet_document_source(document, db)
        name = str(payload.get('name') or f'{document.name} - Salinan')
        file_stem = re.sub(r'[^a-zA-Z0-9_-]+', '-', name).strip('-').lower()
        generated_name = f'{file_stem or "document"}-{uuid.uuid4().hex[:8]}.xlsx'
        output_path = GENERATED_DIR / generated_name
        _write_spreadsheet_document(source_path, output_path, analysis, payload)
    except (OSError, ValueError, InvalidFileException, BadZipFile) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    copied_document = DocumentRecord(
        name=name,
        category=document.category,
        template_name=template.name if template else document.template_name,
        template_version=template.version if template else document.template_version,
        created_by=document.created_by,
        status='generated',
        file_path=f'/api/files/{generated_name}',
        template_id=template.id if template else None,
    )
    db.add(copied_document)
    db.commit()
    db.refresh(copied_document)
    return {
        'id': copied_document.id,
        'name': copied_document.name,
        'file_path': copied_document.file_path,
        'message': 'Document copied successfully.',
    }


def _submission_document_name(payload: dict, fallback: str) -> str:
    metadata_keys = ('purpose', 'applicant_name', 'application_date')
    if not any(key in payload for key in metadata_keys):
        return str(payload.get('name') or fallback)
    if not all(str(payload.get(key) or '').strip() for key in metadata_keys):
        raise HTTPException(
            status_code=422,
            detail='Tujuan, nama pemohon, dan tanggal pengajuan wajib diisi.',
        )

    try:
        application_date = datetime.strptime(
            str(payload['application_date']), '%Y-%m-%d'
        ).date()
    except ValueError as error:
        raise HTTPException(
            status_code=422,
            detail='Tanggal pengajuan harus valid dan menggunakan format YYYY-MM-DD.',
        ) from error

    def safe_component(value: str) -> str:
        component = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', ' ', value)
        component = re.sub(r'\s+', ' ', component).strip(' .')
        if not component:
            raise HTTPException(status_code=422, detail='Nama file pengajuan tidak valid.')
        return component

    purpose = safe_component(str(payload['purpose']).strip())
    applicant_name = safe_component(str(payload['applicant_name']).strip())
    document_name = (
        f'Pengajuan {purpose} - {applicant_name} {application_date:%d%m%Y}'
    )
    if len(document_name) > 195:
        raise HTTPException(
            status_code=422,
            detail='Nama file terlalu panjang. Persingkat tujuan atau nama pemohon.',
        )
    return document_name


@app.post('/api/documents/generate')
def generate_document(payload: dict, db: Session = Depends(get_db)) -> dict:
    template_name = payload.get('template_name', 'Reimbursement Form')
    template_id = payload.get('template_id')
    template_query = db.query(Template)
    if template_id is not None:
        template_row = template_query.filter(Template.id == template_id).first()
        template_name = template_row.name if template_row else template_name
    else:
        template_row = template_query.filter(Template.name == template_name).first()
    if not template_row:
        raise HTTPException(status_code=404, detail='Template not found')

    name = payload.get('name') or f'{template_name} {datetime.now().strftime("%Y%m%d-%H%M")}'
    if template_row.file_name and Path(template_row.file_name).suffix.lower() == '.xlsx':
        name = _submission_document_name(payload, name)
        template_path = (TEMPLATE_DIR / template_row.file_name).resolve()
        if not template_path.is_relative_to(TEMPLATE_DIR.resolve()) or not template_path.is_file():
            raise HTTPException(status_code=404, detail='Template file not found')
        try:
            analysis = analyze_spreadsheet(template_path)
            generated_name = f'{uuid.uuid4().hex}.xlsx'
            output_path = GENERATED_DIR / generated_name
            generate_spreadsheet(
                template_path,
                output_path,
                analysis,
                payload.get('fields', {}),
                payload.get('items', []),
                [
                    {
                        **field,
                        'value': next(
                            (
                                submitted.get('value', '')
                                for submitted in payload.get('custom_fields', [])
                                if isinstance(submitted, dict) and submitted.get('key') == field['key']
                            ),
                            '',
                        ),
                    }
                    for field in json.loads(template_row.custom_fields or '[]')
                ],
            )
        except (OSError, ValueError, InvalidFileException, BadZipFile) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

        document_record = DocumentRecord(
            name=name,
            category=payload.get(
                'category',
                template_row.category.name if template_row.category else 'Finance',
            ),
            template_name=template_row.name,
            template_version=template_row.version,
            created_by=payload.get('created_by', 'user@company'),
            status='generated',
            file_path=f'/api/files/{generated_name}',
            template_id=template_row.id,
        )
        db.add(document_record)
        db.commit()
        db.refresh(document_record)
        return {
            'id': document_record.id,
            'name': document_record.name,
            'status': document_record.status,
            'file_path': document_record.file_path,
            'download_url': document_record.file_path,
            'message': 'Document generated successfully.',
        }

    context = {
        'nama': payload.get('nama', 'Reyval'),
        'tanggal': payload.get('tanggal', datetime.now().strftime('%d %B %Y')),
        'divisi': payload.get('divisi', 'Finance'),
        'keperluan': payload.get('keperluan', 'Pengajuan reimbursement'),
        'nominal': payload.get('nominal', 250000),
        'keterangan': payload.get('keterangan', 'Pembelian kebutuhan operasional'),
        'items': payload.get('items', [
            {
                'keperluan': 'Makan siang',
                'nominal': 25000,
                'keterangan': 'Meeting internal',
            },
            {
                'keperluan': 'Transportasi',
                'nominal': 50000,
                'keterangan': 'Kunjungan cabang',
            },
        ]),
    }

    generated_name = f'{name.lower().replace(" ", "-")}.docx'
    output_path = GENERATED_DIR / generated_name

    template_file = TEMPLATE_DIR / (template_row.file_name or 'reimbursement-form.docx')
    if template_file.exists():
        try:
            template_doc = DocxTemplate(str(template_file))
            template_doc.render(context)
            template_doc.save(str(output_path))
        except Exception:
            doc = DocxDocument()
            doc.add_heading(name, level=1)
            doc.add_paragraph(f'Nama: {context["nama"]}')
            doc.add_paragraph(f'Tanggal: {context["tanggal"]}')
            doc.add_paragraph(f'Divisi: {context["divisi"]}')
            doc.add_paragraph(f'Keperluan: {context["keperluan"]}')
            doc.add_paragraph(f'Nominal: Rp {context["nominal"]:,}')
            for item in context['items']:
                doc.add_paragraph(
                    f"- {item['keperluan']} | Rp {item['nominal']:,} | {item['keterangan']}"
                )
            doc.save(str(output_path))
    else:
        doc = DocxDocument()
        doc.add_heading(name, level=1)
        doc.add_paragraph(f'Nama: {context["nama"]}')
        doc.add_paragraph(f'Tanggal: {context["tanggal"]}')
        doc.add_paragraph(f'Divisi: {context["divisi"]}')
        doc.add_paragraph(f'Keperluan: {context["keperluan"]}')
        doc.add_paragraph(f'Nominal: Rp {context["nominal"]:,}')
        for item in context['items']:
            doc.add_paragraph(f"- {item['keperluan']} | Rp {item['nominal']:,} | {item['keterangan']}")
        doc.save(str(output_path))

    document_record = DocumentRecord(
        name=name,
        category=payload.get('category', 'Finance'),
        template_name=template_name,
        template_version=template_row.version,
        created_by=payload.get('created_by', 'user@company'),
        status='generated',
        file_path=f'/api/files/{generated_name}',
        template_id=template_row.id,
    )
    db.add(document_record)
    db.commit()
    db.refresh(document_record)

    return {
        'id': document_record.id,
        'name': document_record.name,
        'status': document_record.status,
        'download_url': document_record.file_path,
        'message': 'Document generated successfully.',
    }


def _folder_photo_extension(content: bytes) -> str | None:
    if content.startswith(b'\xff\xd8\xff'):
        return '.jpg'
    if content.startswith(b'\x89PNG\r\n\x1a\n'):
        return '.png'
    if content.startswith(b'RIFF') and content[8:12] == b'WEBP':
        return '.webp'
    return None


def _safe_folder_name(value: str) -> str:
    name = value.strip()
    if (
        not name
        or len(name) > 120
        or re.search(r'[<>:"/\\|?*\x00-\x1f]', name)
        or name.endswith(('.', ' '))
        or name in {'.', '..'}
        or re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$', name, re.I)
    ):
        raise HTTPException(status_code=422, detail='Nama folder tidak valid.')
    return name


@app.post('/api/documents/generate-folder')
async def generate_document_folder(
    payload: str = Form(...),
    folder_name: str = Form(...),
    photos: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
) -> dict:
    folder_name = _safe_folder_name(folder_name)
    if len(photos) > MAX_FOLDER_PHOTOS:
        raise HTTPException(
            status_code=413,
            detail=f'Maksimal {MAX_FOLDER_PHOTOS} foto untuk setiap folder.',
        )
    try:
        document_payload = json.loads(payload)
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=422, detail='Data dokumen tidak valid.') from error
    if not isinstance(document_payload, dict):
        raise HTTPException(status_code=422, detail='Data dokumen tidak valid.')

    template = (
        db.query(Template).filter(Template.id == document_payload.get('template_id')).first()
        if document_payload.get('template_id') is not None
        else None
    )
    if not template:
        raise HTTPException(status_code=404, detail='Template not found')
    if not template.file_name or Path(template.file_name).suffix.lower() != '.xlsx':
        raise HTTPException(status_code=415, detail='Folder hanya mendukung template Excel .xlsx.')

    photo_files = []
    total_photo_bytes = 0
    used_names = set()
    for index, photo in enumerate(photos, start=1):
        content = await photo.read(MAX_FOLDER_PHOTO_BYTES + 1)
        if len(content) > MAX_FOLDER_PHOTO_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f'Ukuran setiap foto maksimal {MAX_FOLDER_PHOTO_BYTES // (1024 * 1024)} MB.',
            )
        total_photo_bytes += len(content)
        if total_photo_bytes > MAX_FOLDER_PHOTOS_TOTAL_BYTES:
            raise HTTPException(status_code=413, detail='Total ukuran foto maksimal 30 MB.')

        extension = _folder_photo_extension(content)
        if not extension:
            raise HTTPException(
                status_code=415,
                detail='Foto harus berupa gambar JPG, PNG, atau WebP yang valid.',
            )
        original_name = Path((photo.filename or '').replace('\\', '/')).name
        stem = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', '_', Path(original_name).stem)
        stem = stem.strip(' .')[:80] or f'foto-{index}'
        safe_name = f'{stem}{extension}'
        suffix = 2
        while safe_name.casefold() in used_names:
            safe_name = f'{stem} ({suffix}){extension}'
            suffix += 1
        used_names.add(safe_name.casefold())
        photo_files.append((safe_name, content))

    generated = generate_document(document_payload, db)
    document = db.query(DocumentRecord).filter(DocumentRecord.id == generated['id']).first()
    if not document or not document.file_path:
        raise HTTPException(status_code=500, detail='File Excel hasil tidak tersedia.')

    document.folder_name = folder_name
    db.commit()

    photo_directory = GENERATED_DIR / f'document-{document.id}'
    try:
        photo_directory.mkdir(parents=True, exist_ok=True)
        for photo_name, content in photo_files:
            (photo_directory / photo_name).write_bytes(content)
    except OSError as error:
        logger.exception('Could not store photos for document %s', document.id)
        shutil.rmtree(photo_directory, ignore_errors=True)
        generated_name = document.file_path.removeprefix('/api/files/')
        generated_path = (GENERATED_DIR / generated_name).resolve()
        db.delete(document)
        db.commit()
        if (
            Path(generated_name).name == generated_name
            and generated_path.is_relative_to(GENERATED_DIR.resolve())
            and generated_path.is_file()
        ):
            try:
                generated_path.unlink()
            except OSError:
                logger.exception('Could not remove incomplete document file %s', generated_path)
        raise HTTPException(status_code=500, detail='Foto tidak dapat disimpan.') from error

    return {
        **generated,
        'folder_name': folder_name,
        'photo_count': len(photo_files),
        'message': 'Folder dokumen berhasil dibuat.',
    }


def _document_folder_archive(document: DocumentRecord) -> bytes:
    if not document.folder_name:
        raise HTTPException(status_code=404, detail='Folder dokumen tidak ditemukan.')
    if not document.file_path or not document.file_path.startswith('/api/files/'):
        raise HTTPException(status_code=404, detail='File Excel tidak ditemukan.')

    generated_name = document.file_path.removeprefix('/api/files/')
    workbook_path = (GENERATED_DIR / generated_name).resolve()
    if (
        Path(generated_name).name != generated_name
        or not workbook_path.is_relative_to(GENERATED_DIR.resolve())
        or not workbook_path.is_file()
    ):
        raise HTTPException(status_code=404, detail='File Excel tidak ditemukan.')

    archive_buffer = BytesIO()
    archive_root = document.folder_name
    with ZipFile(archive_buffer, 'w', ZIP_DEFLATED) as archive:
        archive.write(workbook_path, f'{archive_root}/{document.name}.xlsx')
        photo_directory = (GENERATED_DIR / f'document-{document.id}').resolve()
        if photo_directory.is_relative_to(GENERATED_DIR.resolve()) and photo_directory.is_dir():
            for photo_path in photo_directory.iterdir():
                if photo_path.is_file():
                    archive.write(photo_path, f'{archive_root}/{photo_path.name}')
    return archive_buffer.getvalue()


@app.get('/api/documents/{document_id}/download-folder')
def download_document_folder(document_id: int, db: Session = Depends(get_db)) -> Response:
    document = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail='Folder dokumen tidak ditemukan.')
    archive = _document_folder_archive(document)
    filename = f'{quote(document.folder_name, safe="")}.zip'
    return Response(
        content=archive,
        media_type='application/zip',
        headers={
            'Content-Disposition': f"attachment; filename=\"document-folder.zip\"; filename*=UTF-8''{filename}",
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    )


@app.get('/api/documents/{document_id}/folder-preview')
def get_document_folder_preview(document_id: int, db: Session = Depends(get_db)) -> dict:
    document = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not document or not document.folder_name:
        raise HTTPException(status_code=404, detail='Folder dokumen tidak ditemukan.')
    try:
        template, _, output_path, analysis, data = _spreadsheet_document_source(document, db)
    except (OSError, ValueError, InvalidFileException, BadZipFile) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    photo_directory = (GENERATED_DIR / f'document-{document.id}').resolve()
    photos = []
    if photo_directory.is_relative_to(GENERATED_DIR.resolve()) and photo_directory.is_dir():
        photos = [
            {
                'name': photo.name,
                'url': f'/api/documents/{document.id}/photos/{quote(photo.name, safe="")}',
            }
            for photo in sorted(photo_directory.iterdir(), key=lambda item: item.name.casefold())
            if photo.is_file() and photo.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}
        ]

    return {
        'id': document.id,
        'folder_name': document.folder_name,
        'document_name': document.name,
        'template_name': template.name if template else document.template_name,
        'sheet_name': analysis['sheet_name'],
        'fields': [
            {
                'key': field['key'],
                'label': field['label'],
                'value': data['fields'].get(field['key'], ''),
            }
            for field in analysis['fields']
        ],
        'custom_fields': data['custom_fields'],
        'headers': [
            {'key': header['key'], 'label': header['label']}
            for header in analysis['headers']
            if header['editable']
        ],
        'items': data['items'],
        'photos': photos,
        'excel_url': f'/api/files/{output_path.name}',
    }


@app.get('/api/documents/{document_id}/photos/{filename}')
def get_document_photo(document_id: int, filename: str, db: Session = Depends(get_db)) -> FileResponse:
    document = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not document or not document.folder_name:
        raise HTTPException(status_code=404, detail='Foto tidak ditemukan.')
    if Path(filename).name != filename or Path(filename).suffix.lower() not in {
        '.jpg',
        '.jpeg',
        '.png',
        '.webp',
    }:
        raise HTTPException(status_code=404, detail='Foto tidak ditemukan.')

    photo_directory = (GENERATED_DIR / f'document-{document.id}').resolve()
    photo_path = (photo_directory / filename).resolve()
    if (
        not photo_directory.is_relative_to(GENERATED_DIR.resolve())
        or not photo_path.is_relative_to(photo_directory)
        or not photo_path.is_file()
    ):
        raise HTTPException(status_code=404, detail='Foto tidak ditemukan.')
    media_type = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
    }[photo_path.suffix.lower()]
    return FileResponse(
        photo_path,
        media_type=media_type,
        filename=filename,
        content_disposition_type='inline',
        headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'},
    )


def _validated_email_address(value: object) -> str:
    if not isinstance(value, str):
        raise HTTPException(status_code=422, detail='Alamat email tidak valid.')
    address = value.strip().lower()
    email_pattern = r"[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+"
    if len(address) > 320 or not re.fullmatch(email_pattern, address):
        raise HTTPException(status_code=422, detail='Alamat email tidak valid.')
    return address


def _validated_saved_recipients(values: object, db: Session) -> list[str]:
    if not isinstance(values, list) or not 1 <= len(values) <= 10:
        raise HTTPException(status_code=422, detail='Pilih 1 sampai 10 penerima email.')
    addresses = list(dict.fromkeys(_validated_email_address(value) for value in values))
    available = {row[0] for row in db.query(EmailRecipient.email).all()}
    if not set(addresses).issubset(available):
        raise HTTPException(
            status_code=422,
            detail='Semua penerima harus dipilih dari daftar alamat email tersimpan.',
        )
    return addresses


@app.get('/api/email/recipients')
def list_email_recipients(db: Session = Depends(get_db)) -> list[dict]:
    return [
        {'id': recipient.id, 'email': recipient.email}
        for recipient in db.query(EmailRecipient).order_by(EmailRecipient.email).all()
    ]


@app.post('/api/email/recipients')
def create_email_recipient(payload: dict, db: Session = Depends(get_db)) -> dict:
    address = _validated_email_address(payload.get('email'))
    if db.query(EmailRecipient).filter(EmailRecipient.email == address).first():
        raise HTTPException(status_code=409, detail='Alamat email tersebut sudah tersimpan.')
    recipient = EmailRecipient(email=address)
    db.add(recipient)
    db.commit()
    db.refresh(recipient)
    return {'id': recipient.id, 'email': recipient.email}


@app.delete('/api/email/recipients/{recipient_id}')
def delete_email_recipient(recipient_id: int, db: Session = Depends(get_db)) -> dict:
    recipient = db.query(EmailRecipient).filter(EmailRecipient.id == recipient_id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail='Alamat email tidak ditemukan.')
    for template in db.query(EmailTemplate).all():
        addresses = json.loads(template.recipients or '[]')
        if recipient.email in addresses:
            template.recipients = json.dumps(
                [address for address in addresses if address != recipient.email],
                ensure_ascii=False,
            )
    db.delete(recipient)
    db.commit()
    return {'message': 'Alamat email dihapus.'}


def _email_template_values(payload: dict, db: Session) -> dict:
    name = str(payload.get('name') or '').strip()
    subject = payload.get('subject')
    body = payload.get('body')
    if not name or len(name) > 120:
        raise HTTPException(status_code=422, detail='Nama template email wajib diisi (maksimal 120 karakter).')
    if (
        not isinstance(subject, str)
        or not subject.strip()
        or len(subject) > 255
        or any(ord(character) < 32 for character in subject)
    ):
        raise HTTPException(status_code=422, detail='Subjek email wajib diisi (maksimal 255 karakter).')
    if not isinstance(body, str) or not body.strip() or len(body) > 15000:
        raise HTTPException(status_code=422, detail='Isi email wajib diisi (maksimal 15.000 karakter).')
    recipients = _validated_saved_recipients(payload.get('recipients'), db)
    return {
        'name': name,
        'recipients': json.dumps(recipients, ensure_ascii=False),
        'subject': subject.strip(),
        'body': body.strip(),
    }


def _email_template_out(template: EmailTemplate) -> dict:
    return {
        'id': template.id,
        'name': template.name,
        'recipients': json.loads(template.recipients or '[]'),
        'subject': template.subject,
        'body': template.body,
    }


@app.get('/api/email/templates')
def list_email_templates(db: Session = Depends(get_db)) -> list[dict]:
    return [
        _email_template_out(template)
        for template in db.query(EmailTemplate).order_by(EmailTemplate.name).all()
    ]


@app.post('/api/email/templates')
def create_email_template(payload: dict, db: Session = Depends(get_db)) -> dict:
    template = EmailTemplate(**_email_template_values(payload, db))
    db.add(template)
    db.commit()
    db.refresh(template)
    return _email_template_out(template)


@app.put('/api/email/templates/{template_id}')
def update_email_template(template_id: int, payload: dict, db: Session = Depends(get_db)) -> dict:
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail='Template email tidak ditemukan.')
    for key, value in _email_template_values(payload, db).items():
        setattr(template, key, value)
    db.commit()
    db.refresh(template)
    return _email_template_out(template)


@app.delete('/api/email/templates/{template_id}')
def delete_email_template(template_id: int, db: Session = Depends(get_db)) -> dict:
    template = db.query(EmailTemplate).filter(EmailTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail='Template email tidak ditemukan.')
    db.delete(template)
    db.commit()
    return {'message': 'Template email dihapus.'}


@app.post('/api/documents/{document_id}/send-email')
def send_document_folder_email(
    document_id: int,
    payload: dict,
    db: Session = Depends(get_db),
) -> dict:
    document = db.query(DocumentRecord).filter(DocumentRecord.id == document_id).first()
    if not document or not document.folder_name:
        raise HTTPException(status_code=404, detail='Folder dokumen tidak ditemukan.')
    recipients = _validated_saved_recipients(payload.get('recipients'), db)
    subject = payload.get('subject')
    body = payload.get('body')
    if (
        not isinstance(subject, str)
        or not subject.strip()
        or len(subject) > 255
        or any(ord(character) < 32 for character in subject)
    ):
        raise HTTPException(status_code=422, detail='Subjek email wajib diisi (maksimal 255 karakter).')
    if not isinstance(body, str) or not body.strip() or len(body) > 15000:
        raise HTTPException(status_code=422, detail='Isi email wajib diisi (maksimal 15.000 karakter).')
    if not EMAIL_SMTP_USERNAME or not EMAIL_SMTP_PASSWORD or not EMAIL_FROM:
        raise HTTPException(
            status_code=503,
            detail='Email belum dikonfigurasi. Atur kredensial Gmail pada environment server.',
        )

    message = EmailMessage()
    message['From'] = EMAIL_FROM
    message['To'] = ', '.join(recipients)
    message['Subject'] = subject.strip()
    message.set_content(body.strip())
    message.add_attachment(
        _document_folder_archive(document),
        maintype='application',
        subtype='zip',
        filename=f'{document.folder_name}.zip',
    )

    try:
        context = ssl.create_default_context()
        if EMAIL_SMTP_PORT == 465:
            with smtplib.SMTP_SSL(
                EMAIL_SMTP_HOST,
                EMAIL_SMTP_PORT,
                timeout=20,
                context=context,
            ) as server:
                server.login(EMAIL_SMTP_USERNAME, EMAIL_SMTP_PASSWORD)
                refused = server.send_message(message)
        else:
            with smtplib.SMTP(EMAIL_SMTP_HOST, EMAIL_SMTP_PORT, timeout=20) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(EMAIL_SMTP_USERNAME, EMAIL_SMTP_PASSWORD)
                refused = server.send_message(message)
        if refused:
            raise HTTPException(
                status_code=502,
                detail='Sebagian penerima menolak email. Periksa kembali alamat penerima.',
            )
    except smtplib.SMTPException as error:
        logger.exception('Could not send document folder email %s', document.id)
        raise HTTPException(status_code=502, detail='Email gagal dikirim oleh server SMTP.') from error
    except OSError as error:
        logger.exception('Could not connect to SMTP server for document %s', document.id)
        raise HTTPException(status_code=502, detail='Tidak dapat terhubung ke server email.') from error

    return {'message': 'Folder dokumen berhasil dikirim.', 'recipients': recipients}


@app.get('/api/dashboard')
def dashboard(db: Session = Depends(get_db)) -> dict:
    total_templates = db.query(func.count(Template.id)).scalar() or 0
    total_documents = db.query(func.count(DocumentRecord.id)).scalar() or 0
    total_categories = db.query(func.count(Category.id)).scalar() or 0
    latest_documents = db.query(DocumentRecord).order_by(DocumentRecord.created_at.desc()).limit(5).all()
    return {
        'total_templates': total_templates,
        'total_documents': total_documents,
        'total_categories': total_categories,
        'latest_documents': [
            {
                'id': document.id,
                'name': document.name,
                'category': document.category,
                'template_name': document.template_name,
                'template_version': document.template_version,
                'created_by': document.created_by,
                'created_at': document.created_at.isoformat() if document.created_at else None,
                'status': document.status,
                'file_path': document.file_path,
                'folder_name': document.folder_name,
            }
            for document in latest_documents
        ],
        'recent_activity': [
            'Finance template updated to version 1.2',
            'Travel request approved by GA',
            'New IT hardware request submitted',
            'Leave request review completed',
        ],
    }


@app.get('/api/files/{filename}')
def get_generated_file(filename: str, db: Session = Depends(get_db)) -> FileResponse:
    file_path = GENERATED_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail='File not found')
    document = (
        db.query(DocumentRecord)
        .filter(DocumentRecord.file_path == f'/api/files/{filename}')
        .first()
    )
    download_name = f'{document.name}{file_path.suffix}' if document else filename
    return FileResponse(path=file_path, filename=download_name)
