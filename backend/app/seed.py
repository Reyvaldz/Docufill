from sqlalchemy.orm import Session

from .models import Category


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
