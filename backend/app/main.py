from __future__ import annotations

import shutil
import logging
from datetime import datetime
from logging.config import dictConfig

from docxtpl import DocxTemplate
from docx import Document as DocxDocument
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import (
    CORS_ORIGINS,
    GENERATED_DIR,
    MAX_UPLOAD_BYTES,
    MAX_UPLOAD_MB,
    TEMPLATE_DIR,
)
from .database import Base, SessionLocal, engine
from .models import Category, DocumentRecord, Template
from .seed import seed_database

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

    safe_name = file.filename or f'{name.lower().replace(" ", "-")}.docx'
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

    return {'message': 'Document deleted successfully'}


@app.post('/api/documents/generate')
def generate_document(payload: dict, db: Session = Depends(get_db)) -> dict:
    template_name = payload.get('template_name', 'Reimbursement Form')
    template_row = db.query(Template).filter(Template.name == template_name).first()
    if not template_row:
        raise HTTPException(status_code=404, detail='Template not found')

    name = payload.get('name', f'{template_name} {datetime.now().strftime("%Y%m%d-%H%M")}')
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
def get_generated_file(filename: str) -> FileResponse:
    file_path = GENERATED_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail='File not found')
    return FileResponse(path=file_path, filename=filename)
