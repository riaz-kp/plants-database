from typing import Any, List, Optional
import uuid
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
import sqlalchemy as sa
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.db.session import get_db
from app.models.project import Project, ProjectPlant
from app.models.plant import Plant
from app.models.share_link import ProjectShareLink
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectPlantCreate, ProjectUpdate, ProjectListResponse
from app.core.security import get_current_user

router = APIRouter()

@router.get("/", response_model=ProjectListResponse, dependencies=[Depends(get_current_user)])
async def read_projects(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    sort: Optional[str] = "newest"
) -> Any:
    """
    Retrieve projects with pagination and search.
    """
    query = select(Project).options(
        selectinload(Project.plants).selectinload(ProjectPlant.plant).selectinload(Plant.taxon)
    )

    if search:
        query = query.filter(or_(
            Project.name.ilike(f"%{search}%"),
            Project.client_name.ilike(f"%{search}%"),
            Project.location.ilike(f"%{search}%"),
            Project.description.ilike(f"%{search}%")
        ))

    # Count total
    count_stmt = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_stmt)
    total = count_result.scalar_one()

    # Apply ordering
    if sort == "newest":
        query = query.order_by(Project.updated_at.desc())
    elif sort == "oldest":
        query = query.order_by(Project.updated_at.asc())
    elif sort == "name-asc":
        query = query.order_by(Project.name.asc())
    elif sort == "name-desc":
        query = query.order_by(Project.name.desc())
    else:
        query = query.order_by(Project.updated_at.desc())

    # Apply pagination
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    items = result.scalars().all()
    
    return {"items": items, "total": total}

@router.post("/", response_model=ProjectResponse, dependencies=[Depends(get_current_user)])
async def create_project(
    *,
    db: AsyncSession = Depends(get_db),
    project_in: ProjectCreate
) -> Any:
    """
    Create new project.
    """
    project = Project(**project_in.model_dump())
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    # Reload with relationships
    query = select(Project).filter(Project.id == project.id).options(
        selectinload(Project.plants).selectinload(ProjectPlant.plant).selectinload(Plant.taxon)
    )
    result = await db.execute(query)
    return result.scalars().first()


# ─── Public project view by share token (MUST be before /{project_id}) ───────
@router.get("/share/{token}", response_model=ProjectResponse)
async def get_project_by_share_token(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    Public endpoint: fetch a project via its share token.
    Returns 404 if not found; 410 Gone if expired.
    """
    result = await db.execute(
        select(ProjectShareLink).filter(ProjectShareLink.token == token)
    )
    link = result.scalars().first()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")
    if link.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="Share link has expired")

    query = select(Project).filter(Project.id == link.project_id).options(
        selectinload(Project.plants).selectinload(ProjectPlant.plant).selectinload(Plant.taxon)
    )
    result = await db.execute(query)
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}", response_model=ProjectResponse, dependencies=[Depends(get_current_user)])
async def read_project(
    *,
    db: AsyncSession = Depends(get_db),
    project_id: uuid.UUID
) -> Any:
    """
    Get project by ID.
    """
    query = select(Project).filter(Project.id == project_id).options(
        selectinload(Project.plants).selectinload(ProjectPlant.plant).selectinload(Plant.taxon)
    )
    result = await db.execute(query)
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.post("/{project_id}/plants", response_model=ProjectResponse, dependencies=[Depends(get_current_user)])
async def add_plant_to_project(
    *,
    db: AsyncSession = Depends(get_db),
    project_id: uuid.UUID,
    plant_in: ProjectPlantCreate
) -> Any:
    """
    Add plant to project.
    """
    # Check if project exists
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if plant exists
    result = await db.execute(select(Plant).filter(Plant.id == plant_in.plant_id))
    plant = result.scalars().first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")

    # Check if already exists in project
    result = await db.execute(
        select(ProjectPlant).filter(
            ProjectPlant.project_id == project_id,
            ProjectPlant.plant_id == plant_in.plant_id
        )
    )
    existing = result.scalars().first()
    
    if existing:
        existing.notes = plant_in.notes
        existing.quantity = plant_in.quantity
        existing.unit = plant_in.unit
        existing.optimum_height_size = plant_in.optimum_height_size
        existing.rate = plant_in.rate
        db.add(existing)
    else:
        # Create new association
        new_association = ProjectPlant(
            project_id=project_id,
            plant_id=plant_in.plant_id,
            notes=plant_in.notes,
            quantity=plant_in.quantity,
            unit=plant_in.unit,
            optimum_height_size=plant_in.optimum_height_size,
            rate=plant_in.rate
        )
        db.add(new_association)
        
    project.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(project)
    
    # Reload project with relationships
    query = select(Project).filter(Project.id == project_id).options(
        selectinload(Project.plants).selectinload(ProjectPlant.plant).selectinload(Plant.taxon)
    )
    result = await db.execute(query)
    return result.scalars().first()

@router.put("/{project_id}/plants/{plant_id}", response_model=ProjectResponse, dependencies=[Depends(get_current_user)])
async def update_plant_in_project(
    *,
    db: AsyncSession = Depends(get_db),
    project_id: uuid.UUID,
    plant_id: uuid.UUID,
    plant_in: ProjectPlantCreate
) -> Any:
    """
    Update a plant's notes in a project.
    """
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(ProjectPlant).filter(
            ProjectPlant.project_id == project_id,
            ProjectPlant.plant_id == plant_id
        )
    )
    existing = result.scalars().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Plant not found in this project")

    existing.notes = plant_in.notes
    existing.quantity = plant_in.quantity
    existing.unit = plant_in.unit
    existing.optimum_height_size = plant_in.optimum_height_size
    existing.rate = plant_in.rate

    project.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(project)

    query = select(Project).filter(Project.id == project_id).options(
        selectinload(Project.plants).selectinload(ProjectPlant.plant).selectinload(Plant.taxon)
    )
    result = await db.execute(query)
    return result.scalars().first()

@router.delete("/{project_id}/plants/{plant_id}", response_model=ProjectResponse, dependencies=[Depends(get_current_user)])
async def remove_plant_from_project(
    *,
    db: AsyncSession = Depends(get_db),
    project_id: uuid.UUID,
    plant_id: uuid.UUID
) -> Any:
    """
    Remove a plant from a project.
    """
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(ProjectPlant).filter(
            ProjectPlant.project_id == project_id,
            ProjectPlant.plant_id == plant_id
        )
    )
    existing = result.scalars().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Plant not found in this project")

    await db.delete(existing)
    project.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(project)

    query = select(Project).filter(Project.id == project_id).options(
        selectinload(Project.plants).selectinload(ProjectPlant.plant).selectinload(Plant.taxon)
    )
    result = await db.execute(query)
    return result.scalars().first()

@router.put("/{project_id}", response_model=ProjectResponse, dependencies=[Depends(get_current_user)])
async def update_project(
    *,
    db: AsyncSession = Depends(get_db),
    project_id: uuid.UUID,
    project_in: ProjectUpdate
) -> Any:
    """
    Update a project by ID.
    """
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_data = project_in.model_dump(exclude_unset=True)
    for field in update_data:
        setattr(project, field, update_data[field])

    project.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(project)
    
    # Reload with relationships
    query = select(Project).filter(Project.id == project.id).options(
        selectinload(Project.plants).selectinload(ProjectPlant.plant).selectinload(Plant.taxon)
    )
    result = await db.execute(query)
    return result.scalars().first()

@router.delete("/{project_id}", dependencies=[Depends(get_current_user)])
async def delete_project(
    *,
    db: AsyncSession = Depends(get_db),
    project_id: uuid.UUID
) -> Any:
    """
    Delete a project by ID.
    """
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await db.delete(project)
    await db.commit()
    return {"success": True}

@router.post("/{project_id}/duplicate", response_model=ProjectResponse, dependencies=[Depends(get_current_user)])
async def duplicate_project(
    *,
    db: AsyncSession = Depends(get_db),
    project_id: uuid.UUID
) -> Any:
    """
    Duplicate a project including its plants.
    """
    # Fetch source project
    query = select(Project).filter(Project.id == project_id).options(
        selectinload(Project.plants)
    )
    result = await db.execute(query)
    source_project = result.scalars().first()
    
    if not source_project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Create new project
    new_project = Project(
        name=f"{source_project.name} (Copy)",
        client_name=source_project.client_name,
        location=source_project.location,
        description=source_project.description
    )
    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)

    # Copy plants
    for pp in source_project.plants:
        new_pp = ProjectPlant(
            project_id=new_project.id,
            plant_id=pp.plant_id,
            notes=pp.notes,
            quantity=pp.quantity,
            unit=pp.unit,
            optimum_height_size=pp.optimum_height_size,
            rate=pp.rate
        )
        db.add(new_pp)
    
    await db.commit()

    # Reload with relationships
    query = select(Project).filter(Project.id == new_project.id).options(
        selectinload(Project.plants).selectinload(ProjectPlant.plant).selectinload(Plant.taxon)
    )
    result = await db.execute(query)
    return result.scalars().first()


# ─── Share link schemas ────────────────────────────────────────────────────────
class ShareLinkResponse(BaseModel):
    token: str
    expires_at: datetime
    url: str


# ─── Generate / regenerate share link ─────────────────────────────────────────
@router.post("/{project_id}/share", response_model=ShareLinkResponse, dependencies=[Depends(get_current_user)])
async def create_or_regenerate_share_link(
    *,
    db: AsyncSession = Depends(get_db),
    project_id: uuid.UUID,
) -> Any:
    """
    Generate (or regenerate) a 2-day share link for the project.
    Only one link exists per project; regeneration replaces the old one.
    """
    result = await db.execute(select(Project).filter(Project.id == project_id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=2)

    # Upsert: delete any existing link, create fresh
    existing = await db.execute(
        select(ProjectShareLink).filter(ProjectShareLink.project_id == project_id)
    )
    old = existing.scalars().first()
    if old:
        await db.delete(old)
        await db.flush()

    share_link = ProjectShareLink(
        project_id=project_id,
        token=token,
        expires_at=expires_at,
    )
    db.add(share_link)
    await db.commit()

    return ShareLinkResponse(
        token=token,
        expires_at=expires_at,
        url=f"/share/{token}",
    )


# ─── Get current share link info ──────────────────────────────────────────────
@router.get("/{project_id}/share", response_model=Optional[ShareLinkResponse], dependencies=[Depends(get_current_user)])
async def get_share_link(
    *,
    db: AsyncSession = Depends(get_db),
    project_id: uuid.UUID,
) -> Any:
    """Return the current share link for a project, or null if none exists / expired."""
    result = await db.execute(
        select(ProjectShareLink).filter(ProjectShareLink.project_id == project_id)
    )
    link = result.scalars().first()
    if not link or link.expires_at < datetime.utcnow():
        return None
    return ShareLinkResponse(
        token=link.token,
        expires_at=link.expires_at,
        url=f"/share/{link.token}",
    )
