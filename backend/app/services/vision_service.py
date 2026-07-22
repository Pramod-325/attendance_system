import cv2
import numpy as np
import torch
from PIL import Image
from facenet_pytorch import MTCNN, InceptionResnetV1

class VisionService:
    def __init__(self):
        # Force CPU execution to completely bypass Apple Silicon MPS pooling bugs
        self.device = torch.device('cpu')
        print("🚀 INITIALIZING VISION ENGINE ON: CPU (Bypassing MPS constraints)")
        
        # Initialize MTCNN on CPU
        self.mtcnn = MTCNN(keep_all=False, device=self.device)
        
        # Initialize ResNet on CPU
        self.resnet = InceptionResnetV1(pretrained='vggface2').eval().to(self.device)
        print("✅ PyTorch Models Loaded Successfully on CPU.")

    def extract_faces_and_embeddings(self, image_bytes: bytes) -> dict:
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {"embeddings": [], "spoof_detected": False}

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(img_rgb)

        valid_embeddings = []
        spoof_detected = False

        try:
            # 1. Find Face and Crop perfectly on CPU
            face_tensor = self.mtcnn(pil_img)
            
            if face_tensor is None:
                print("🔎 PYTORCH: No faces found in frame.")
                return {"embeddings": [], "spoof_detected": False}

            # 2. Prepare tensor
            face_tensor = face_tensor.unsqueeze(0).to(self.device)
            
            # 3. Extract the 512-Dimension Vector
            with torch.no_grad():
                embedding = self.resnet(face_tensor).cpu().numpy()[0]
            
            # 4. Normalize for PostgreSQL Cosine distance
            embedding = embedding / np.linalg.norm(embedding)
            valid_embeddings.append(embedding)
            
            print("✅ SUCCESS: Face detected and vectorized on CPU!")
            
        except Exception as e:
            print(f"🛑 PYTORCH CRASH: {e}")

        return {"embeddings": valid_embeddings, "spoof_detected": spoof_detected}