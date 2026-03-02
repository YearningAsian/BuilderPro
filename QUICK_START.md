# Quick Start Guide for BuilderPro Backend

## Option 1: Local Development (Recommended)

### Prerequisites
- Python 3.8+
- PostgreSQL installed locally OR use Supabase

### Setup Steps

1. **Create and activate virtual environment**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # macOS/Linux
   # OR
   venv\Scripts\activate     # Windows
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your database URL

4. **Run the server**
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```

   Server running at: http://localhost:8000
   API docs at: http://localhost:8000/docs

---

## Option 2: Docker Compose (Easiest)

### Prerequisites
- Docker and Docker Compose installed

### Setup Steps

1. **Start containers**
   ```bash
   cd backend
   docker-compose up
   ```

   This will start:
   - PostgreSQL database on port 5432
   - FastAPI server on port 8000

2. **Access API**
   - API: http://localhost:8000
   - Docs: http://localhost:8000/docs

3. **Stop containers**
   ```bash
   docker-compose down
   ```

---

## Testing the API

Once the server is running, test with curl or visit http://localhost:8000/docs

### Health Check
```bash
curl http://localhost:8000/health
```

### Get all materials
```bash
curl http://localhost:8000/api/materials
```

### Create a customer
```bash
curl -X POST http://localhost:8000/api/customers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Customer",
    "email": "customer@example.com",
    "phone": "555-1234"
  }'
```

---

## Frontend Connection

The frontend is configured to connect to: `http://localhost:8000/api`

Frontend runs on: `http://localhost:3000`

Both should work together seamlessly once running!
