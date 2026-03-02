from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import API_V1_STR, PROJECT_NAME, PROJECT_VERSION, ALLOWED_ORIGINS
from app.api import materials, projects, orders, customers, vendors
from app.db.base import engine, Base

# Create tables
Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
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
app.include_router(materials.router, prefix=API_V1_STR)
app.include_router(projects.router, prefix=API_V1_STR)
app.include_router(orders.router, prefix=API_V1_STR)
app.include_router(customers.router, prefix=API_V1_STR)
app.include_router(vendors.router, prefix=API_V1_STR)


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
