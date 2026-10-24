from typing import Any
from fastapi import APIRouter, Depends
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
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Get total counts for dashboard overview.
    This replaces several large API calls that were only used for counts.
    All four counts come back in one query, so one database round trip.
    """
    stmt = select(
        select(func.count(Plant.id)).scalar_subquery().label("total_plants"),
        select(func.count(Taxon.id)).scalar_subquery().label("total_taxonomy_nodes"),
        select(func.count(Category.id)).scalar_subquery().label("total_categories"),
        select(func.count(Project.id)).scalar_subquery().label("total_projects"),
    )
    row = (await db.execute(stmt)).one()

    return row._asdict()
