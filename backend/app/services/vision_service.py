import cv2
import numpy as np
import onnxruntime as ort
import os

class VisionService:
    def __init__(self):
        # Determine model path (ensure the models/ directory exists at the root)
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        model_path = os.path.join(base_dir, "models", "mobilefacenet.onnx")
        
        # We use OpenCV's built in Haar Cascade for face detection.
        cascade_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'haarcascade_frontalface_default.xml')
        self.face_cascade = cv2.CascadeClassifier(cascade_path)
        if self.face_cascade.empty():
            print(f"Warning: Could not load cascade at {cascade_path}")
        
        try:
            self.session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])
            self.input_name = self.session.get_inputs()[0].name
        except Exception as e:
            print(f"Warning: Could not load ONNX model at {model_path}. Error: {e}")
            self.session = None

    def passes_quality_gates(self, gray_img: np.ndarray) -> bool:
        # 1. Blur Detection using Variance of Laplacian
        laplacian_var = cv2.Laplacian(gray_img, cv2.CV_64F).var()
        if laplacian_var < 100:  # Threshold for blurriness (tune as needed)
            print(f"Frame rejected: Too blurry (Variance: {laplacian_var})")
            return False

        # 2. Luminance Check
        avg_luminance = np.mean(gray_img)
        if avg_luminance < 40:  # Threshold for darkness
            print(f"Frame rejected: Too dark (Luminance: {avg_luminance})")
            return False
        if avg_luminance > 240: # Threshold for too bright / washed out
            print(f"Frame rejected: Too bright (Luminance: {avg_luminance})")
            return False

        return True

    def detect_and_crop_face(self, img: np.ndarray, gray_img: np.ndarray) -> np.ndarray:
        # Detect faces
        faces = self.face_cascade.detectMultiScale(
            gray_img,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30)
        )

        if len(faces) == 0:
            return None

        # Assume the first detected face is the primary one, get the largest one ideally
        # We sort by area (w*h) and pick the largest
        faces = sorted(faces, key=lambda f: f[2]*f[3], reverse=True)
        (x, y, w, h) = faces[0]

        ih, iw, _ = img.shape

        # Add a slight margin (e.g., 10%)
        margin_x = int(w * 0.1)
        margin_y = int(h * 0.1)

        x1 = max(0, x - margin_x)
        y1 = max(0, y - margin_y)
        x2 = min(iw, x + w + margin_x)
        y2 = min(ih, y + h + margin_y)

        cropped_face = img[y1:y2, x1:x2]
        return cropped_face
        
    def extract_embedding(self, image_bytes: bytes) -> np.ndarray:
        # 1. Decode raw bytes to OpenCV image
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image bytes")

        # Convert to grayscale for quality and detection
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # 2. Apply Quality Gates
        if not self.passes_quality_gates(gray):
            raise ValueError("Quality gate failed: image is too blurry or improperly lit")

        # 3. Detect and Crop Face
        cropped_face = self.detect_and_crop_face(img, gray)
        if cropped_face is None or cropped_face.size == 0:
            raise ValueError("No face detected in the image")

        if not self.session:
            # Fallback for testing if model isn't downloaded yet
            return np.random.rand(512).astype(np.float32)

        # 4. Preprocess to fit MobileFaceNet inputs (112x112)
        img_resized = cv2.resize(cropped_face, (112, 112))
        img_blob = img_resized.astype(np.float32) / 255.0
        img_blob = np.transpose(img_blob, (2, 0, 1)) # HWC to CHW
        img_blob = np.expand_dims(img_blob, axis=0) # Add batch dimension
        
        # 5. Run AI Inference
        inputs = {self.input_name: img_blob}
        embedding = self.session.run(None, inputs)[0][0]
        
        # L2 Normalize the embedding for cosine similarity
        embedding = embedding / np.linalg.norm(embedding)
        return embedding
