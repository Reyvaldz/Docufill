from sqlalchemy.orm import Session

from .models import Category, DocumentRecord, Template


def seed_database(db: Session) -> None:
    if db.query(Category).count() == 0:
        categories = [
            Category(name='Finance', description='Reimbursement, expense reports, and payment support.'),
            Category(name='General Affairs', description='Travel, accommodation, and facility requests.'),
            Category(name='Human Resources', description='Leave, permits, and employee administration.'),
            Category(name='IT', description='Hardware, software, and service requests.'),
        ]
        db.add_all(categories)
        db.commit()

    if db.query(Template).count() == 0:
        finance = db.query(Category).filter(Category.name == 'Finance').one()
        ga = db.query(Category).filter(Category.name == 'General Affairs').one()
        hr = db.query(Category).filter(Category.name == 'Human Resources').one()
        it = db.query(Category).filter(Category.name == 'IT').one()

        templates = [
            Template(name='Reimbursement Form', category_id=finance.id, description='Expense reimbursement form for employee claims.', status='active', version='1.0', file_name='reimbursement-form.docx'),
            Template(name='Travel Request', category_id=ga.id, description='Dinas and travel request form.', status='active', version='1.1', file_name='travel-request.docx'),
            Template(name='Leave Request', category_id=hr.id, description='Employee leave request form.', status='active', version='1.0', file_name='leave-request.docx'),
            Template(name='IT Asset Request', category_id=it.id, description='Request for device or asset procurement.', status='active', version='2.0', file_name='it-asset-request.docx'),
        ]
        db.add_all(templates)
        db.commit()

    if db.query(DocumentRecord).count() == 0:
        docs = [
            DocumentRecord(name='Reimbursement Maret 2026', category='Finance', template_name='Reimbursement Form', template_version='1.0', created_by='ira.surya', status='generated', file_path='/files/reimbursement-maret-2026.docx'),
            DocumentRecord(name='Travel Request Bandung', category='General Affairs', template_name='Travel Request', template_version='1.1', created_by='dian.martin', status='approved', file_path='/files/travel-bandung.docx'),
            DocumentRecord(name='Cuti Tahunan', category='Human Resources', template_name='Leave Request', template_version='1.0', created_by='nana.putri', status='generated', file_path='/files/cuti-tahunan.docx'),
        ]
        db.add_all(docs)
        db.commit()
