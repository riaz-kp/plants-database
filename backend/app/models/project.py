import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import ForeignKey, String, Text, Integer, DateTime
import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base_class import Base

class Project(Base):
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, index=True, nullable=False)
    client_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default=sa.text('now()'))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, server_default=sa.text('now()'), onupdate=datetime.utcnow)

    # Relationships
    plants: Mapped[List["ProjectPlant"]] = relationship("ProjectPlant", back_populates="project", cascade="all, delete-orphan")

class ProjectPlant(Base):
    """
    Association table between Project and Plant with extra data (quantity, notes).
    """
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    plant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plants.id"), primary_key=True)
    
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    quantity: Mapped[Optional[float]] = mapped_column(sa.Float, nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    optimum_height_size: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    rate: Mapped[Optional[float]] = mapped_column(sa.Float, nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="plants")
    plant: Mapped["Plant"] = relationship("Plant")  # Unidirectional from association to plant is usually enough
