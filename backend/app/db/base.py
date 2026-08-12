from app.db.base_class import Base  # noqa

# Import all models here for Alembic to detect them
from app.models.taxon import Taxon  # noqa
from app.models.plant import Plant  # noqa
from app.models.project import Project, ProjectPlant  # noqa
from app.models.category import Category  # noqa
from app.models.share_link import ProjectShareLink  # noqa
