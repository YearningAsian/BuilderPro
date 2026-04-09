from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://postgres:password@localhost:5432/builderpro"

    # Supabase
    supabase_url: str = ""
    supabase_key: str = ""

    # JWT
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # API metadata
    api_v1_str: str = "/api"
    project_name: str = "BuilderPro"
    project_version: str = "0.1.0"

    # CORS
    allowed_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:8000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:8000",
    ]

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        """Supabase and Heroku use postgres:// — SQLAlchemy requires postgresql://"""
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "case_sensitive": False}


settings = Settings()

# ---------------------------------------------------------------------------
# Flat exports for backwards compatibility
# All existing imports like `from app.core.config import DATABASE_URL` still work.
# ---------------------------------------------------------------------------
DATABASE_URL = settings.database_url
SUPABASE_URL = settings.supabase_url
SUPABASE_KEY = settings.supabase_key
SECRET_KEY = settings.secret_key
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes
API_V1_STR = settings.api_v1_str
PROJECT_NAME = settings.project_name
PROJECT_VERSION = settings.project_version
ALLOWED_ORIGINS = settings.allowed_origins