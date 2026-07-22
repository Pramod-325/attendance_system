import asyncio
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import text
from typing import List
import numpy as np

from app.database import AsyncSessionLocal 
from app.models import Student, AttendanceLog
from app.services.vision_service import VisionService
from sqlalchemy.ext.asyncio import AsyncSession

executor = ThreadPoolExecutor(max_workers=4)
vision_service = VisionService()

async def process_registration_images(images: List[bytes], name: str, db: AsyncSession) -> dict:
    loop = asyncio.get_running_loop()
    embeddings = []

    for img_bytes in images:
        try:
            # Run the new YuNet pipeline
            vision_result = await loop.run_in_executor(
                executor, 
                vision_service.extract_faces_and_embeddings, 
                img_bytes
            )
            
            # 1. Reject Spoofs during registration
            if vision_result.get("spoof_detected"):
                return {"status": "error", "message": "SECURITY ALERT: Spoofing (Photo/Screen) detected during registration."}

            frame_embeddings = vision_result.get("embeddings", [])
            
            # 2. STRICT VALIDATION: Only accept frames with EXACTLY one face
            if len(frame_embeddings) == 1:
                embeddings.append(frame_embeddings[0])
            elif len(frame_embeddings) > 1:
                return {"status": "error", "message": "Multiple faces detected. Please ensure only the student is in frame."}
                
        except Exception as e:
            print(f"Error processing registration frame: {e}")
    
    if len(embeddings) == 0:
        return {"status": "error", "message": "No valid human face detected in the provided images."}

    # Average the vectors for higher accuracy
    avg_embedding = np.mean(embeddings, axis=0)
    avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)
    vector_str = str(avg_embedding.tolist())
    
    # Check for duplicates using the new strict threshold
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
            "message": f"Face already registered under the name: {closest_match.name}"
        }

    # Save the perfect tight-crop vector
    new_student = Student(name=name, face_embedding=avg_embedding.tolist())
    db.add(new_student)
    await db.commit()
    
    return {"status": "success", "message": "Student successfully enrolled."}

async def process_attendance_frame(image_bytes: bytes) -> dict:
    loop = asyncio.get_running_loop()
    
    try:
        vision_result = await loop.run_in_executor(
            executor, 
            vision_service.extract_faces_and_embeddings, 
            image_bytes
        )
    except Exception as e:
        return {"status": "error", "message": "Vision processing failed."}

    # IMMEDIATE SPOOF REJECTION
    if vision_result.get("spoof_detected"):
        return {"status": "error", "message": "SECURITY ALERT: Spoofing attempt detected!"}

    live_embeddings = vision_result.get("embeddings", [])

    if not live_embeddings:
        return {"status": "not_found", "message": "No valid human faces detected in frame."}

    marked_students = []
    
    async with AsyncSessionLocal() as db:
        try:
            for live_embedding in live_embeddings:
                query = text("""
                    SELECT id, name, face_embedding <=> :live_vector AS distance 
                    FROM students 
                    ORDER BY distance ASC 
                    LIMIT 1
                """)
                
                result = await db.execute(query, {"live_vector": str(live_embedding.tolist())})
                closest_match = result.fetchone()

                # High accuracy threshold matching
                if closest_match and closest_match.distance < 0.35:
                    student_id = closest_match.id
                    
                    check_query = text("""
                        SELECT id FROM attendance_logs 
                        WHERE student_id = :student_id 
                        AND DATE(timestamp) = CURRENT_DATE
                    """)
                    check_result = await db.execute(check_query, {"student_id": student_id})
                    
                    if not check_result.fetchone():
                        new_log = AttendanceLog(student_id=student_id)
                        db.add(new_log)
                        marked_students.append(closest_match.name)
            
            await db.commit()
            
            if marked_students:
                names = ", ".join(marked_students)
                return {"status": "success", "message": f"✅ Attendance marked for: {names}"}
            else:
                return {"status": "warning", "message": "Faces detected, but already marked or unknown."}
                
        except Exception as db_error:
            await db.rollback()
            return {"status": "error", "message": "Database error occurred."}