import asyncio
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List
import numpy as np

from app.models import Student, AttendanceLog
from app.services.vision_service import VisionService

# Execute CPU-bound tasks here so we don't block the FastAPI event loop
executor = ThreadPoolExecutor(max_workers=4)
vision_service = VisionService()

async def process_registration_images(images: List[bytes], name: str, db: AsyncSession):
    loop = asyncio.get_running_loop()
    embeddings = []

    # Extract vectors in the background thread pool
    for img_bytes in images:
        try:
            embedding = await loop.run_in_executor(
                executor, 
                vision_service.extract_embedding, 
                img_bytes
            )
            embeddings.append(embedding)
        except Exception as e:
            print(f"Error processing registration frame: {e}")
    
    if embeddings:
        # Average the vectors for higher accuracy and normalize
        avg_embedding = np.mean(embeddings, axis=0)
        avg_embedding = avg_embedding / np.linalg.norm(avg_embedding)
        
        new_student = Student(name=name, face_embedding=avg_embedding.tolist())
        db.add(new_student)
        await db.commit()

async def process_attendance_frame(image_bytes: bytes, db: AsyncSession):
    loop = asyncio.get_running_loop()
    
    try:
        # Extract vector from the incoming webcam frame
        live_embedding = await loop.run_in_executor(
            executor,
            vision_service.extract_embedding,
            image_bytes
        )
    except Exception as e:
        print(f"Error processing attendance frame: {e}")
        return

    live_embedding_list = live_embedding.tolist()
    
    # Native pgvector similarity search via SQLAlchemy
    # <=> operator calculates Cosine Distance (0 is perfect match, 1 is opposite)
    # We set a strict threshold (e.g., < 0.4 distance means high confidence)
    query = text("""
        SELECT id, name, face_embedding <=> :live_vector AS distance 
        FROM students 
        ORDER BY distance ASC 
        LIMIT 1
    """)
    
    result = await db.execute(query, {"live_vector": str(live_embedding_list)})
    closest_match = result.fetchone()

    if closest_match and closest_match.distance < 0.4:
        # Match found! Log the attendance.
        student_id = closest_match.id
        
        new_log = AttendanceLog(student_id=student_id)
        db.add(new_log)
        await db.commit()
        print(f"✅ Attendance marked for: {closest_match.name} (Distance: {closest_match.distance:.3f})")
    else:
        print("❌ No matching student found in the database.")