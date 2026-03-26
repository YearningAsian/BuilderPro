# BuilderPro Backend

A FastAPI-based REST API for BuilderPro, a materials and cost management system for construction teams.

## Tech Stack

- **Framework**: FastAPI
- **ORM**: SQLAlchemy
- **Database**: PostgreSQL (via Supabase)
- **Server**: Uvicorn
- **Language**: Python 3.8+

## Project Structure

```
backend/
├── app/
│   ├── api/                 # API routes
│   │   ├── materials.py    # Materials endpoints
│   │   ├── projects.py     # Projects endpoints
│   │   ├── orders.py       # Orders (project items) endpoints
│   │   ├── customers.py    # Customers endpoints
│   │   └── vendors.py      # Vendors endpoints
│   ├── core/
│   │   └── config.py       # Configuration settings
│   ├── db/
│   │   └── base.py         # Database setup
│   ├── models/
│   │   └── models.py       # SQLAlchemy models
│   ├── schemas/
│   │   └── schemas.py      # Pydantic schemas
│   └── main.py             # FastAPI app initialization
├── requirements.txt         # Python dependencies
├── .env.example            # Environment variables template
└── README.md
```

## Installation

### Prerequisites
- Python 3.8+
- pip or poetry
- PostgreSQL (or Supabase instance)

### Setup

1. **Create virtual environment**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Install dependencies**
```bash
pip install -r requirements.txt
```

3. **Configure environment**
Copy `.env.example` to `.env` and fill in your database URL:
```bash
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/builderpro
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
SECRET_KEY=your-secret-key-for-production
```

## Running the Server

### Development
```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

### Production
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## API Documentation

Once the server is running, access:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API Endpoints

### Materials
- `GET /api/materials` - Get all materials
- `GET /api/materials/{id}` - Get material by ID
- `POST /api/materials` - Create material
- `PUT /api/materials/{id}` - Update material
- `DELETE /api/materials/{id}` - Delete material

### Projects
- `GET /api/projects` - Get all projects
- `GET /api/projects/{id}` - Get project by ID
- `POST /api/projects` - Create project
- `PUT /api/projects/{id}` - Update project
- `DELETE /api/projects/{id}` - Delete project

### Orders (Project Items)
- `GET /api/orders` - Get all orders
- `GET /api/orders/{id}` - Get order by ID
- `POST /api/orders?project_id={id}` - Create order
- `PUT /api/orders/{id}` - Update order
- `DELETE /api/orders/{id}` - Delete order

### Customers
- `GET /api/customers` - Get all customers
- `GET /api/customers/{id}` - Get customer by ID
- `POST /api/customers` - Create customer
- `PUT /api/customers/{id}` - Update customer
- `DELETE /api/customers/{id}` - Delete customer

### Vendors
- `GET /api/vendors` - Get all vendors
- `GET /api/vendors/{id}` - Get vendor by ID
- `POST /api/vendors` - Create vendor
- `PUT /api/vendors/{id}` - Update vendor
- `DELETE /api/vendors/{id}` - Delete vendor

## Database Setup

The database tables are created automatically when the app starts. For custom migrations, use Alembic.

## Development Features

- **Auto-reload**: API reloads on file changes in development
- **Swagger Documentation**: Interactive API documentation at `/docs`
- **CORS**: Enabled for frontend communication
- **Error Handling**: Proper HTTP status codes and error messages
- **Validation**: Request/response validation with Pydantic

## Next Steps

- Add authentication (JWT tokens)
- Implement database migrations with Alembic
- Add request logging and monitoring
- Create seed data for development
- Add file upload/export functionality
- Write unit and integration tests

## Troubleshooting

### Database Connection Error
- Ensure PostgreSQL/Supabase is running
- Verify DATABASE_URL in .env
- If your DB provider gives a `postgres://...` URL, the backend normalizes it automatically
- Check username and password

### Import Errors
- Ensure you've installed all dependencies: `pip install -r requirements.txt`
- Make sure you're in the backend directory
- Check that PYTHONPATH includes the project root
