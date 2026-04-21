import os

from dotenv import load_dotenv

load_dotenv()


def _normalize_database_url(url: str) -> str:
    """Normalize provider-specific URL variants into SQLAlchemy-compatible form."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url

# Database
DATABASE_URL = _normalize_database_url(
    os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:password@localhost:5432/builderpro",
    )
)

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "") or os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ADMIN_KEY = SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "builderpro-materials")

# Email / notifications
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
INVITE_FROM_EMAIL = os.getenv("INVITE_FROM_EMAIL", "")
APP_BASE_URL = os.getenv("APP_BASE_URL", "").rstrip("/")

# API
API_V1_STR = "/api"
PROJECT_NAME = "BuilderPro"
PROJECT_VERSION = "0.1.0"

# CORS
_DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:350",
    "http://localhost:3500",
    "http://localhost:3501",
    "http://localhost:8000",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:350",
    "http://127.0.0.1:3500",
    "http://127.0.0.1:3501",
    "http://127.0.0.1:8000",
]

_extra_allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

ALLOWED_ORIGINS = list(dict.fromkeys(_DEFAULT_ALLOWED_ORIGINS + _extra_allowed_origins))

# JWT / local dev auth fallback
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
ENABLE_LOCAL_AUTH_FALLBACK = os.getenv("ENABLE_LOCAL_AUTH_FALLBACK", "true").strip().lower() in {"1", "true", "yes", "on"}
