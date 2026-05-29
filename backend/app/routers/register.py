from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.database import get_db
from app.services.processor import process_registration_images

router = APIRouter()

@router.post("/register")
async def register_student(
    name: str = Form(...),
    images: List[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db)
):
    if not images:
        raise HTTPException(status_code=400, detail="No images provided.")

    try:
        image_bytes_list = [await img.read() for img in images]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading images: {str(e)}")
    
    # We now 'await' the processor directly to get the result
    result = await process_registration_images(image_bytes_list, name, db)
    
    if result["status"] == "duplicate":
        # Return a 409 Conflict status code for duplicates
        raise HTTPException(status_code=409, detail=result["message"])
        
    elif result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])

    return {"message": result["message"]}