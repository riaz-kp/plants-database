import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi_cache import FastAPICache
from fastapi_cache.decorator import cache
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.category import Category
from app.models.plant import Plant
from app.schemas.category import CategoryResponse, CategoryCreate, CategoryUpdate, CategoryListResponse

router = APIRouter()

@router.get("/", response_model=CategoryListResponse)
@cache(expire=3600, namespace="categories")
async def read_categories(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None
) -> Any:
    """
    Retrieve categories with plant counts and pagination.
    """
    # Base query for selecting items
    query = (
        select(Category, func.count(Plant.id))
        .outerjoin(Plant, Category.name == Plant.category)
        .group_by(Category.id, Category.name, Category.description)
    )
    
    if search:
        query = query.filter(or_(
            Category.name.ilike(f"%{search}%"),
            Category.description.ilike(f"%{search}%")
        ))

    # Count total
    count_stmt = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_stmt)
    total = count_result.scalar_one()

    # Final items query with ordering and pagination
    query = query.order_by(Category.name).offset(skip).limit(limit)
    result = await db.execute(query)
    
    categories = []
    for cat, count in result.all():
        cat.plant_count = count
        categories.append(cat)
        
    return {"items": categories, "total": total}

@router.post("/", response_model=CategoryResponse)
async def create_category(
    *,
    db: AsyncSession = Depends(get_db),
    category_in: CategoryCreate
) -> Any:
    # Check duplicate name
    result = await db.execute(select(Category).filter(func.lower(Category.name) == category_in.name.lower()))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Category with this name already exists")
        
    category = Category(**category_in.model_dump())
    db.add(category)
    await db.commit()
    category.plant_count = 0
    await FastAPICache.clear(namespace="categories")
    await FastAPICache.clear(namespace="dashboard")
    return category

@router.put("/{category_id}", response_model=CategoryResponse)
async def update_category(
    *,
    db: AsyncSession = Depends(get_db),
    category_id: str,
    category_in: CategoryUpdate
) -> Any:
    result = await db.execute(select(Category).filter(Category.id == category_id))
    category = result.scalars().first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
        
    if category_in.name and category_in.name != category.name:
        dup = await db.execute(select(Category).filter(func.lower(Category.name) == category_in.name.lower()))
        if dup.scalars().first():
            raise HTTPException(status_code=400, detail="Category with this name already exists")
            
    # Also update the string inside the plants table? Yes, we should probably update plants that use this category!
    old_name = category.name
    
    update_data = category_in.model_dump(exclude_unset=True)
    for field in update_data:
        setattr(category, field, update_data[field])
        
    db.add(category)
    
    # Cascade name change to plants if the name changed
    if category_in.name and category_in.name != old_name:
        plants = await db.execute(select(Plant).filter(Plant.category == old_name))
        for p in plants.scalars().all():
            p.category = category_in.name
            db.add(p)

    await db.commit()
    await db.refresh(category)
    
    count_result = await db.execute(select(func.count(Plant.id)).where(Plant.category == category.name))
    category.plant_count = count_result.scalar_one()
    
    await FastAPICache.clear(namespace="categories")
    await FastAPICache.clear(namespace="plants")
    await FastAPICache.clear(namespace="dashboard")
    
    return category

@router.delete("/{category_id}")
async def delete_category(
    *,
    db: AsyncSession = Depends(get_db),
    category_id: str
) -> Any:
    result = await db.execute(select(Category).filter(Category.id == category_id))
    category = result.scalars().first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
        
    # Check if plants use this category
    plants = await db.execute(select(Plant).filter(Plant.category == category.name).limit(1))
    if plants.scalars().first():
        raise HTTPException(status_code=400, detail="Cannot delete category that is in use by plants. Update plants first.")
        
    await db.delete(category)
    await db.commit()
    await FastAPICache.clear(namespace="categories")
    await FastAPICache.clear(namespace="dashboard")
    return {"success": True}
