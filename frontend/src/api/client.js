import axios from 'axios';

// Connects to your FastAPI backend
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  headers: {
    // Note: Do NOT set 'Content-Type': 'multipart/form-data' here.
    // Axios automatically sets it with the correct boundary when passing FormData.
    'Accept': 'application/json',
  },
});

export default apiClient;