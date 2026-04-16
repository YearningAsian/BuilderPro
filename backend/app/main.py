from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from app.core.config import API_V1_STR, PROJECT_NAME, PROJECT_VERSION, ALLOWED_ORIGINS, DATABASE_URL
from app.api import auth, materials, projects, orders, customers, vendors, search, reports
from app.db.base import Base, SessionLocal, engine
from app.models import models as _models  # noqa: F401

# Initialize FastAPI app
# NOTE: Schema is managed via Supabase migrations (supabase/migrations/).
# Do NOT call Base.metadata.create_all() in production — it bypasses migration history.
app = FastAPI(
    title=PROJECT_NAME,
    version=PROJECT_VERSION,
    description="Construction materials and cost management system API"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(auth.router, prefix=API_V1_STR)
app.include_router(materials.router, prefix=API_V1_STR)
app.include_router(projects.router, prefix=API_V1_STR)
app.include_router(orders.router, prefix=API_V1_STR)
app.include_router(customers.router, prefix=API_V1_STR)
app.include_router(vendors.router, prefix=API_V1_STR)
app.include_router(search.router, prefix=API_V1_STR)
app.include_router(reports.router, prefix=API_V1_STR)


@app.on_event("startup")
def ensure_local_sqlite_schema():
    """Auto-create tables for local SQLite development only."""
    if DATABASE_URL.startswith("sqlite"):
        Base.metadata.create_all(bind=engine)


@app.get("/")
def read_root():
    """Root endpoint"""
    return {
        "project": PROJECT_NAME,
        "version": PROJECT_VERSION,
        "status": "running"
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.get("/health/db")
def database_health_check():
    """Database connectivity check."""
    db = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except SQLAlchemyError as exc:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "detail": exc.__class__.__name__,
        }
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
