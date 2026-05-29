import os
from urllib.parse import urlparse, urlunparse
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from dotenv import load_dotenv

load_dotenv()

raw_url = os.getenv("NEON_DB_URL")
if not raw_url:
    raise ValueError("NEON_DB_URL environment variable is not set in the .env file")

# 1. STRIP THE QUERY PARAMETERS
# We extract the base URL and drop all query params (like ?sslmode=require&options=...) 
# This completely prevents the 'channel_binding' and 'sslmode' unexpected keyword errors.
parsed_url = urlparse(raw_url)
clean_url = urlunparse((
    "postgresql+asyncpg",
    parsed_url.netloc,
    parsed_url.path,
    parsed_url.params,
    "", # <-- Drops the problematic query string completely
    parsed_url.fragment
))

# 2. BULLETPROOF ENGINE CONFIGURATION
engine = create_async_engine(
    clean_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
    
    # -- PREVENT SERVERLESS DROPS --
    # Checks if Neon dropped the connection before checking it out of the pool
    pool_pre_ping=True,      
    # Recycles connections every 5 minutes so they don't go stale in Neon's proxy
    pool_recycle=300,        
    
    connect_args={
        # Safely pass SSL requirement directly to asyncpg natively
        "ssl": "require",    
        
        # -- PREVENT PGBOUNCER CRASHES --
        # CRITICAL: Disables asyncpg's prepared statements cache. 
        # Without this, Neon's PgBouncer will cause random "prepared statement does not exist" errors.
        "statement_cache_size": 0, 
    }
)

AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

# Dependency block to inject DB sessions into route handlers
async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()