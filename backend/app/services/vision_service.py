import cv2
import numpy as np
import onnxruntime as ort
import os

class VisionService:
    def __init__(self):
        # Determine model path (ensure the models/ directory exists at the root)
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        model_path = os.path.join(base_dir, "models", "mobilefacenet.onnx")
        
        # In a real environment, you might also load an SCRFD ONNX model for face detection first.
        # For simplicity, this class assumes the image is already cropped to the face,
        # or we just process the center of the frame.
        
        try:
            self.session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
            self.input_name = self.session.get_inputs()[0].name
        except Exception as e:
            print(f"Warning: Could not load ONNX model at {model_path}. Error: {e}")
            self.session = None
        
    def extract_embedding(self, image_bytes: bytes) -> np.ndarray:
        if not self.session:
            # Fallback for testing if model isn't downloaded yet
            return np.random.rand(512).astype(np.float32)

        # 1. Decode raw bytes to OpenCV image
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image bytes")
        
        # 2. Preprocess to fit MobileFaceNet inputs (112x112)
        img_resized = cv2.resize(img, (112, 112))
        img_blob = img_resized.astype(np.float32) / 255.0
        img_blob = np.transpose(img_blob, (2, 0, 1)) # HWC to CHW
        img_blob = np.expand_dims(img_blob, axis=0) # Add batch dimension
        
        # 3. Run AI Inference
        inputs = {self.input_name: img_blob}
        embedding = self.session.run(None, inputs)[0][0]
        
        # L2 Normalize the embedding for cosine similarity
        embedding = embedding / np.linalg.norm(embedding)
        return embedding