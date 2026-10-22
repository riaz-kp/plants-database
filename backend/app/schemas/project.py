from typing import List, Optional
import uuid
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.plant import PlantResponse

# ProjectPlant Schemas
class ProjectPlantBase(BaseModel):
    plant_id: uuid.UUID
    notes: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    optimum_height_size: Optional[str] = None
    rate: Optional[float] = None

class ProjectPlantCreate(ProjectPlantBase):
    pass

class ProjectPlantUpdate(BaseModel):
    notes: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    optimum_height_size: Optional[str] = None
    rate: Optional[float] = None

class ProjectPlantResponse(ProjectPlantBase):
    plant: Optional[PlantResponse] = None # Nested plant details
    model_config = ConfigDict(from_attributes=True)

# Project Schemas
class ProjectBase(BaseModel):
    name: str
    client_name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    landscape_architect: Optional[str] = None
    architect: Optional[str] = None
    boq_date: Optional[date] = None
    quotation_date: Optional[date] = None

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(ProjectBase):
    pass

class ProjectLockUpdate(BaseModel):
    is_locked: bool

class ProjectPlantsBulkCreate(BaseModel):
    plant_ids: List[uuid.UUID]

class ProjectPlantsBulkResult(BaseModel):
    added: int
    skipped: int

class ProjectResponse(ProjectBase):
    id: uuid.UUID
    is_locked: bool = False
    created_at: datetime
    updated_at: datetime
    plants: List[ProjectPlantResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

class ProjectListResponse(BaseModel):
    items: List[ProjectResponse]
    total: int
