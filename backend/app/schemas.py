from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CategoryOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TemplateOut(BaseModel):
    id: int
    name: str
    category_id: int
    description: Optional[str] = None
    status: str
    version: str
    file_name: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentOut(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    template_name: Optional[str] = None
    template_version: Optional[str] = None
    created_by: str
    created_at: Optional[datetime] = None
    status: str
    file_path: Optional[str] = None

    class Config:
        from_attributes = True


class DashboardOut(BaseModel):
    total_templates: int
    total_documents: int
    total_categories: int
    latest_documents: List[DocumentOut]
    recent_activity: List[str]


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1)
    category_id: int
    description: Optional[str] = None
    version: str = '1.0'
