from pydantic import BaseModel
from datetime import datetime

class StudentResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

class AttendanceLogResponse(BaseModel):
    id: int
    student_id: int
    student_name: str
    timestamp: datetime