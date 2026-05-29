from fastapi import APIRouter, UploadFile, File, Form, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.services.processor import process_registration_images

router = APIRouter()

@router.post("/register")
async def register_student(
    background_tasks: BackgroundTasks,
    name: str = Form(...),
    images: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db)
):
    if not images:
        raise HTTPException(status_code=400, detail="No images provided.")

    # Read the raw file bytes into memory immediately
    # We must do this before the request context closes
    try:
        image_bytes_list = [await img.read() for img in images]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading images: {str(e)}")
    
    # Hand off the heavy CPU lifting and DB saving to the background processor
    background_tasks.add_task(process_registration_images, image_bytes_list, name, db)
    
    # Return immediately to free up the web server for the next request
    return {"message": "Registration received. Processing in the background."}