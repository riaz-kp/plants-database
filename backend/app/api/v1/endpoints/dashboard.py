from typing import Any
from fastapi import APIRouter, Depends
from fastapi_cache.decorator import cache
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.plant import Plant
from app.models.taxon import Taxon
from app.models.category import Category
from app.models.project import Project
from app.schemas.dashboard import DashboardStats

router = APIRouter()

@router.get("/stats", response_model=DashboardStats)
@cache(expire=300)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Get total counts for dashboard overview.
    This replaces several large API calls that were only used for counts.
    """
    
    # 1. Count Plants
    plants_count_stmt = select(func.count(Plant.id))
    plants_count_res = await db.execute(plants_count_stmt)
    total_plants = plants_count_res.scalar_one()

    # 2. Count Taxonomy Nodes
    taxon_count_stmt = select(func.count(Taxon.id))
    taxon_count_res = await db.execute(taxon_count_stmt)
    total_taxonomy_nodes = taxon_count_res.scalar_one()

    # 3. Count Categories
    categories_count_stmt = select(func.count(Category.id))
    categories_count_res = await db.execute(categories_count_stmt)
    total_categories = categories_count_res.scalar_one()

    # 4. Count Projects
    projects_count_stmt = select(func.count(Project.id))
    projects_count_res = await db.execute(projects_count_stmt)
    total_projects = projects_count_res.scalar_one()

    return {
        "total_plants": total_plants,
        "total_taxonomy_nodes": total_taxonomy_nodes,
        "total_categories": total_categories,
        "total_projects": total_projects
    }
