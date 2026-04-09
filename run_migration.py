#!/usr/bin/env python3
"""Apply Supabase migration to the database."""

import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables from backend/.env
env_path = Path(__file__).parent / "backend" / ".env"
load_dotenv(env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env")
    sys.exit(1)

# Read migration file (defaults to the latest .sql file, or accepts a path argument)
migrations_dir = Path(__file__).parent / "supabase" / "migrations"
if len(sys.argv) > 1:
    migration_file = Path(sys.argv[1])
    if not migration_file.is_absolute():
        migration_file = Path(__file__).parent / migration_file
else:
    migration_candidates = sorted(migrations_dir.glob("*.sql"))
    if not migration_candidates:
        print("ERROR: No migration files found")
        sys.exit(1)
    migration_file = migration_candidates[-1]

with open(migration_file, "r", encoding="utf-8") as f:
    migration_sql = f.read()

print("Connecting to configured database...")
engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as conn:
        print("Executing migration...")
        conn.execute(text(migration_sql))
        conn.commit()
        print("✓ Migration applied successfully!")
except Exception as e:
    print(f"✗ Migration failed: {e}")
    sys.exit(1)
finally:
    engine.dispose()
