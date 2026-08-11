import json
from typing import List, Union, Any

from pydantic import AnyHttpUrl, PostgresDsn, validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "Landshaft Plants Database"
    BACKEND_CORS_ORIGINS: List[str] = []

    @validator("BACKEND_CORS_ORIGINS", pre=True)
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], Any]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, str) and v.startswith("["):
            return json.loads(v)
        return v
    
    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "plants_db"
    POSTGRES_PORT: str = "5432"
    
    # SQLALCHEMY_DATABASE_URI will be assembled below
    
    # Cloudinary Config (Image Uploads)
    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    
    # Groq AI
    GROQ_API_KEY: str = ""

    # Auth
    ADMIN_USERNAME: str = ""
    ADMIN_PASSWORD: str = ""
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 1 week

    # Neon Postgres
    NEON: Union[str, None] = None
    SQLALCHEMY_DATABASE_URI: Union[PostgresDsn, str] = None

    @validator("SQLALCHEMY_DATABASE_URI", pre=True)
    def assemble_db_connection(cls, v: Union[str, None], values: dict[str, any]) -> any:
        if isinstance(v, str) and v:
            return v
        
        neon_url = values.get("NEON")
        if neon_url:
            # For Neon, we ensure it uses the asyncpg scheme if it's a standard postgresql:// URL
            if neon_url.startswith("postgresql://"):
                neon_url = neon_url.replace("postgresql://", "postgresql+asyncpg://", 1)
            
            # Remove parameters that asyncpg doesn't support directly in the URL
            if "?" in neon_url:
                base_url, query = neon_url.split("?", 1)
                import urllib.parse
                params = urllib.parse.parse_qs(query)
                # Remove problematic params
                params.pop("sslmode", None)
                params.pop("channel_binding", None)
                # Reconstruct query
                new_query = urllib.parse.urlencode(params, doseq=True)
                neon_url = f"{base_url}?{new_query}" if new_query else base_url
                
            return neon_url

        return PostgresDsn.build(
            scheme="postgresql+asyncpg",
            username=values.get("POSTGRES_USER"),
            password=values.get("POSTGRES_PASSWORD"),
            host=values.get("POSTGRES_SERVER"),
            port=int(values.get("POSTGRES_PORT")),
            path=f"{values.get('POSTGRES_DB') or ''}",
        )

    class Config:
        case_sensitive = True
        env_file = ".env"


settings = Settings()
