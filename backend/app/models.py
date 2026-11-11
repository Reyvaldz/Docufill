from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from .database import Base


class Category(Base):
    __tablename__ = 'categories'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    templates = relationship('Template', back_populates='category')


class Template(Base):
    __tablename__ = 'templates'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    category_id = Column(Integer, ForeignKey('categories.id'), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(20), default='active')
    version = Column(String(20), default='1.0')
    file_name = Column(String(255), nullable=True)
    custom_fields = Column(Text, nullable=False, default='[]')
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    category = relationship('Category', back_populates='templates')
    documents = relationship('DocumentRecord', back_populates='template')


class DocumentRecord(Base):
    __tablename__ = 'documents'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    category = Column(String(100), nullable=True)
    template_name = Column(String(200), nullable=True)
    template_version = Column(String(20), nullable=True)
    created_by = Column(String(100), default='user@company')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(20), default='generated')
    file_path = Column(String(255), nullable=True)
    template_id = Column(Integer, ForeignKey('templates.id'), nullable=True)

    template = relationship('Template', back_populates='documents')
