from typing import Any, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models.plant import Plant
from app.models.taxon import Taxon
from app.models.enums import PlantingPlace, Rank
from app.schemas.plant import PlantCreate, PlantResponse, PlantUpdate, PlantListResponse
from app.services.cloudinary_service import upload_image, upload_image_from_url
from pydantic import BaseModel

router = APIRouter()

@router.get("/", response_model=PlantListResponse)
async def read_plants(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = None,
    planting_place: Optional[PlantingPlace] = None,
    search: Optional[str] = None,
    taxon_id: Optional[uuid.UUID] = None,
    sort: Optional[str] = "recent"
) -> Any:
    """
    Retrieve plants with filtering and search.
    """
    query = select(Plant).options(selectinload(Plant.taxon))
    
    if category:
        query = query.filter(Plant.category == category)
    if planting_place:
        if planting_place == PlantingPlace.INDOOR:
            query = query.filter(Plant.planting_place.in_([PlantingPlace.INDOOR, PlantingPlace.BOTH]))
        elif planting_place == PlantingPlace.OUTDOOR:
            query = query.filter(Plant.planting_place.in_([PlantingPlace.OUTDOOR, PlantingPlace.BOTH]))
        elif planting_place == PlantingPlace.BOTH:
            # If BOTH is requested (meaning both checkboxes in UI), show everything
            # Actually, showing everything is the same as skipping the filter.
            pass
    if search:
        query = query.filter(or_(
            Plant.common_name.ilike(f"%{search}%"),
            Plant.scientific_name.ilike(f"%{search}%")
        ))
    if taxon_id:
        query = query.filter(Plant.taxon_id == taxon_id)
        
    # Count total
    count_stmt = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_stmt)
    total = count_result.scalar_one()

    # Apply sorting
    if sort == "recent":
        query = query.order_by(Plant.created_at.desc())
    elif sort == "oldest":
        query = query.order_by(Plant.created_at.asc())
    elif sort == "asc":
        query = query.order_by(Plant.common_name.asc())
    elif sort == "desc":
        query = query.order_by(Plant.common_name.desc())
    elif sort == "sci_asc":
        query = query.order_by(Plant.scientific_name.asc())
    elif sort == "sci_desc":
        query = query.order_by(Plant.scientific_name.desc())
    else:
        query = query.order_by(Plant.created_at.desc())

    query = query.offset(skip).limit(limit)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    return {"items": items, "total": total}

@router.post("/upload-image")
async def handle_upload_image(
    file: UploadFile = File(...),
    image_type: str = Form("image")  # 'icon' or 'image'
) -> Any:
    """
    Upload an image for a plant to Cloudinary.
    Returns the secure URL.
    """
    if image_type not in ["icon", "image"]:
        raise HTTPException(status_code=400, detail="Invalid image type.")
        
    try:
        url = await upload_image(file, folder="plants")
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class UploadFromUrlRequest(BaseModel):
    url: str
    image_type: str = "image"  # 'icon' or 'image'

@router.post("/upload-image-from-url")
async def handle_upload_image_from_url(
    request: UploadFromUrlRequest
) -> Any:
    """
    Fetch a remote image URL and upload it to Cloudinary.
    Returns the Cloudinary secure URL.
    """
    if request.image_type not in ["icon", "image"]:
        raise HTTPException(status_code=400, detail="Invalid image type.")
    if not request.url or not request.url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL.")

    try:
        url = await upload_image_from_url(request.url, folder="plants")
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=PlantResponse)
async def create_plant(
    *,
    db: AsyncSession = Depends(get_db),
    plant_in: PlantCreate,
    ignore_duplicate: bool = Query(False)
) -> Any:
    """
    Create new plant.
    Validates that the linked taxon is of rank 'Species'.
    """
    # 1. Validate Taxon
    if plant_in.taxon_id:
        result = await db.execute(select(Taxon).filter(Taxon.id == plant_in.taxon_id))
        taxon = result.scalars().first()
        if not taxon:
            raise HTTPException(status_code=404, detail="Taxon not found")
        
        if taxon.rank != Rank.SPECIES:
            raise HTTPException(
                status_code=400, 
                detail=f"Plant can only be linked to a Taxon of rank 'Species'. Current rank: {taxon.rank}"
            )

    # Check for duplicate
    if not ignore_duplicate:
        existing = None
        if plant_in.taxon_id:
            result = await db.execute(select(Plant).filter(Plant.taxon_id == plant_in.taxon_id))
            existing = result.scalars().first()
        
        if not existing and plant_in.scientific_name:
            result = await db.execute(
                select(Plant).filter(func.lower(Plant.scientific_name) == plant_in.scientific_name.strip().lower())
            )
            existing = result.scalars().first()
            
        if not existing and plant_in.common_name:
            result = await db.execute(
                select(Plant).filter(func.lower(Plant.common_name) == plant_in.common_name.strip().lower())
            )
            existing = result.scalars().first()
                
        if existing:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "A duplicate plant already exists in the database.",
                    "is_duplicate": True,
                    "existing_plant": {
                        "id": str(existing.id),
                        "common_name": existing.common_name,
                        "scientific_name": existing.scientific_name
                    }
                }
            )

    # 2. Create Plant
    plant = Plant(**plant_in.model_dump())
    db.add(plant)
    await db.commit()
    await db.refresh(plant)
    
    # Reload with relationships
    result = await db.execute(
        select(Plant).filter(Plant.id == plant.id).options(selectinload(Plant.taxon))
    )
    return result.scalars().first()

@router.get("/{plant_id}", response_model=PlantResponse)
async def read_plant(
    *,
    db: AsyncSession = Depends(get_db),
    plant_id: uuid.UUID
) -> Any:
    """
    Get plant by ID.
    """
    query = select(Plant).filter(Plant.id == plant_id).options(selectinload(Plant.taxon))
    result = await db.execute(query)
    plant = result.scalars().first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    return plant

@router.put("/{plant_id}", response_model=PlantResponse)
async def update_plant(
    *,
    db: AsyncSession = Depends(get_db),
    plant_id: uuid.UUID,
    plant_in: PlantUpdate
) -> Any:
    """
    Update plant by ID.
    """
    result = await db.execute(select(Plant).filter(Plant.id == plant_id))
    plant = result.scalars().first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")

    if plant_in.taxon_id and plant_in.taxon_id != plant.taxon_id:
        taxon_res = await db.execute(select(Taxon).filter(Taxon.id == plant_in.taxon_id))
        taxon = taxon_res.scalars().first()
        if not taxon or taxon.rank != Rank.SPECIES:
            raise HTTPException(status_code=400, detail="Invalid Taxon or Rank must be Species")

    update_data = plant_in.model_dump(exclude_unset=True)
    for field in update_data:
        setattr(plant, field, update_data[field])

    await db.commit()
    await db.refresh(plant)
    
    # Reload with relationships
    result = await db.execute(
        select(Plant).filter(Plant.id == plant.id).options(selectinload(Plant.taxon))
    )
    return result.scalars().first()

@router.delete("/{plant_id}")
async def delete_plant(
    *,
    db: AsyncSession = Depends(get_db),
    plant_id: uuid.UUID
) -> Any:
    """
    Delete plant and its corresponding taxonomy if it is not used by other plants.
    """
    result = await db.execute(select(Plant).filter(Plant.id == plant_id))
    plant = result.scalars().first()
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    
    taxon_id = plant.taxon_id
    
    try:
        await db.delete(plant)
        
        # Clean up taxonomy hierarchy: delete the associated taxon and its parents if they're now orphans
        curr_taxon_id = taxon_id
        while curr_taxon_id:
            # 1. Check if any other plant is using this taxon
            other_p_stmt = select(Plant).filter(Plant.taxon_id == curr_taxon_id, Plant.id != plant_id)
            other_p_res = await db.execute(other_p_stmt)
            if other_p_res.scalars().first():
                break  # Still used by other plants
            
            # 2. Check if this taxon has any other children
            other_c_stmt = select(Taxon).filter(Taxon.parent_id == curr_taxon_id)
            other_c_res = await db.execute(other_c_stmt)
            if other_c_res.scalars().first():
                break  # Still has sub-taxons
            
            # 3. Fetch the taxon object to get its parent_id before deletion
            taxon_to_del_res = await db.execute(select(Taxon).filter(Taxon.id == curr_taxon_id))
            taxon_to_del = taxon_to_del_res.scalars().first()
            if not taxon_to_del:
                break
            
            parent_id = taxon_to_del.parent_id
            await db.delete(taxon_to_del)
            # Flush so the next iteration's child check doesn't see this deleted taxon
            await db.flush() 
            
            # Move up the tree
            curr_taxon_id = parent_id
        
        await db.commit()
        return {"success": True}
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete this plant because it is currently part of one or more projects."
        )
