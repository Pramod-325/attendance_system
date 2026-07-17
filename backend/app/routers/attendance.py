from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.processor import process_attendance_frame

router = APIRouter()

@router.post("/attendance")
async def mark_attendance(image: UploadFile = File(...)):
    if not image:
        raise HTTPException(status_code=400, detail="No camera frame provided.")

    try:
        image_bytes = await image.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail="Failed to read frame.")

    # AWAIT the result directly instead of using a background task
    result = await process_attendance_frame(image_bytes)

    # Return the exact status and message back to React
    return result