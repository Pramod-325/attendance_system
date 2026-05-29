from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.processor import process_attendance_frame

router = APIRouter()

@router.post("/attendance")
async def mark_attendance(
    background_tasks: BackgroundTasks,
    image: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    if not image:
        raise HTTPException(status_code=400, detail="No camera frame provided.")

    try:
        image_bytes = await image.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Failed to read frame.")

    # Background task extracts the vector, searches pgvector, and logs attendance
    background_tasks.add_task(process_attendance_frame, image_bytes, db)

    return {"message": "Frame received for analysis."}