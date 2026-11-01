import ssl
import certifi
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# Check if we are using Neon or SSL connection
connect_args = {}
if "neon.tech" in str(settings.SQLALCHEMY_DATABASE_URI) or "sslmode" in str(settings.SQLALCHEMY_DATABASE_URI):
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    connect_args["ssl"] = ssl_context
elif "neon.tech" in str(settings.SQLALCHEMY_DATABASE_URI):
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    connect_args["ssl"] = ssl_context

engine = create_async_engine(
    str(settings.SQLALCHEMY_DATABASE_URI),
    echo=settings.SQL_ECHO,
    future=True,
    connect_args=connect_args,
    pool_pre_ping=True,
    pool_recycle=300
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
