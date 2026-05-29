from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import text

from app.database import engine, Base
from app.routers import register, attendance

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure the vector extension exists and create tables
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown: Close database connections securely
    await engine.dispose()

app = FastAPI(title="Edge AI Attendance Backend", lifespan=lifespan)

# CORS configuration to allow the React frontend to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://studious-robot-x5wjvqjjqqq6hq55-5173.app.github.dev"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register endpoints
app.include_router(register.router, prefix="/api", tags=["Registration"])
app.include_router(attendance.router, prefix="/api", tags=["Attendance"])

@app.get("/")
async def root():
    return {"message": "Attendance API is running."}