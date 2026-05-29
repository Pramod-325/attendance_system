from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from app.database import Base

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    # 512 dimensions matches MobileFaceNet's output
    face_embedding = Column(Vector(512), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class AttendanceLog(Base):
    __tablename__ = "attendance_logs"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    # Optional: Add class_id or event_id here later