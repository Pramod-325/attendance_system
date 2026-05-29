import asyncio
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List
import numpy as np

from app.models import Student, AttendanceLog
from app.services.vision_service import VisionService

executor = ThreadPoolExecutor(max_workers=4)
vision_service = VisionService()

async def process_registration_images(images: List[bytes], name: str, db: AsyncSession) -> dict:
    loop = asyncio.get_running_loop()
    embeddings = []

    for img_bytes in images:
        try:
            embedding = await loop.run_in_executor(executor, vision_service.extract_embedding, img_bytes)
            embeddings.append(embedding)
        except Exception as e:
            print(f"Error processing frame: {e}")
    
    if not embeddings:
        return {"status": "error", "message": "Could not extract face data from images."}

    avg_embedding = np.mean(embeddings, axis=0)
    avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)
    vector_str = str(avg_embedding.tolist())

    # --- NEW: DUPLICATE CHECK ---
    # We use a strict threshold (0.35) to ensure we don't accidentally block similar-looking siblings
    duplicate_query = text("""
        SELECT name, face_embedding <=> :vector AS distance 
        FROM students 
        ORDER BY distance ASC 
        LIMIT 1
    """)
    
    result = await db.execute(duplicate_query, {"vector": vector_str})
    closest_match = result.fetchone()

    if closest_match and closest_match.distance < 0.35:
        return {
            "status": "duplicate", 
            "message": f"Face already registered under the name: {closest_match.name} (Match: {1 - closest_match.distance:.2%})"
        }

    # If no duplicate, proceed to save
    new_student = Student(name=name, face_embedding=avg_embedding.tolist())
    db.add(new_student)
    await db.commit()
    
    return {"status": "success", "message": "Student successfully enrolled."}


async def process_attendance_frame(image_bytes: bytes, db: AsyncSession):
    loop = asyncio.get_running_loop()
    
    try:
        live_embedding = await loop.run_in_executor(executor, vision_service.extract_embedding, image_bytes)
    except Exception as e:
        return

    # --- EXISTING: FIND CLOSEST MATCH ---
    query = text("""
        SELECT id, name, face_embedding <=> :live_vector AS distance 
        FROM students 
        ORDER BY distance ASC 
        LIMIT 1
    """)
    
    result = await db.execute(query, {"live_vector": str(live_embedding.tolist())})
    closest_match = result.fetchone()

    if closest_match and closest_match.distance < 0.4:
        student_id = closest_match.id
        
        # --- NEW: DAILY ATTENDANCE DEDUPLICATION ---
        # Checks if this specific student already has a log for today
        check_query = text("""
            SELECT id FROM attendance_logs 
            WHERE student_id = :student_id 
            AND DATE(timestamp) = CURRENT_DATE
        """)
        
        check_result = await db.execute(check_query, {"student_id": student_id})
        already_marked = check_result.fetchone()

        if already_marked:
            print(f"⚠️ {closest_match.name} was already marked present today. Skipping.")
            return

        # If not marked today, insert the log
        new_log = AttendanceLog(student_id=student_id)
        db.add(new_log)
        await db.commit()
        print(f"✅ Attendance marked for: {closest_match.name}")