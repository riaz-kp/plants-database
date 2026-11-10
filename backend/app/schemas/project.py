from typing import List, Literal, Optional
import uuid
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field
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
    added_at: Optional[datetime] = None
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

# Bulk import into a project
class PlantNameMatchRequest(BaseModel):
    names: List[str] = Field(..., max_length=1000)

class PlantBrief(BaseModel):
    id: uuid.UUID
    common_name: str
    scientific_name: Optional[str] = None
    category: Optional[str] = None
    icon_url: Optional[str] = None

class PlantSuggestion(PlantBrief):
    in_project: bool = False

class PlantNameMatch(BaseModel):
    name: str
    status: Literal["found", "in_project", "missing"]
    plant: Optional[PlantBrief] = None
    # Other catalog plants with exactly this name (e.g. two "Croton"s)
    alternatives: List[PlantBrief] = []
    # Close catalog names for a missing name
    suggestions: List[PlantSuggestion] = []

class PlantNameMatchResponse(BaseModel):
    results: List[PlantNameMatch]

class ProjectImportRowResult(BaseModel):
    status: Literal["created", "linked", "already_in_project", "failed"]
    plant_id: Optional[uuid.UUID] = None
    error: Optional[str] = None

class ProjectImportResult(BaseModel):
    created: int
    linked: int
    already_in_project: int
    failed: int
    errors: List[str] = []
    rows: List[ProjectImportRowResult] = []

class ProjectResponse(ProjectBase):
    id: uuid.UUID
    is_locked: bool = False
    created_at: datetime
    updated_at: datetime
    plants: List[ProjectPlantResponse] = []
    
    model_config = ConfigDict(from_attributes=True)

class ProjectSummary(ProjectBase):
    """A project as shown in lists: the plant count instead of every plant."""
    id: uuid.UUID
    is_locked: bool = False
    created_at: datetime
    updated_at: datetime
    plant_count: int = 0

    model_config = ConfigDict(from_attributes=True)

class ProjectListResponse(BaseModel):
    items: List[ProjectSummary]
    total: int
