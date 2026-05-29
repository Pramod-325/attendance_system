import React, { useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { Camera, UserPlus, Loader2 } from 'lucide-react';
import apiClient from '../api/client';
import { useWebcamCapture } from '../hooks/useWebcamCapture';

export default function RegistrationCamera() {
  const webcamRef = useRef(null);
  const { captureMultipleFrames } = useWebcamCapture(webcamRef);
  
  const [studentName, setStudentName] = useState('');
  const [status, setStatus] = useState({ loading: false, message: '', type: '' });

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setStatus({ loading: false, message: 'Student name is required.', type: 'error' });
      return;
    }

    setStatus({ loading: true, message: 'Capturing facial telemetry...', type: 'info' });

    try {
      const frames = await captureMultipleFrames(5, 500);
      
      setStatus({ loading: true, message: 'Transmitting to secure server...', type: 'info' });
      
      const formData = new FormData();
      formData.append('name', studentName.trim());
      frames.forEach((blob, index) => {
        formData.append('images', blob, `frame_${index}.jpg`);
      });

      await apiClient.post('/register', formData);
      
      setStatus({ loading: false, message: 'Registration queued successfully!', type: 'success' });
      setStudentName('');
    } catch (error) {
      console.error(error);
      setStatus({ 
        loading: false, 
        message: error.response?.data?.detail || 'Network error occurred.', 
        type: 'error' 
      });
    }
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6 border border-gray-100">
      <div className="flex items-center gap-2 mb-6 border-b pb-4">
        <UserPlus className="text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-800">New Enrollment</h2>
      </div>

      <form onSubmit={handleRegister} className="flex flex-col gap-4">
        <div className="relative rounded-lg overflow-hidden bg-gray-900 aspect-video">
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            videoConstraints={{ facingMode: "user", width: 640, height: 480 }}
            className="w-full h-full object-cover"
          />
        </div>

        <input
          type="text"
          placeholder="Enter Legal Name"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
          disabled={status.loading}
        />

        <button
          type="submit"
          disabled={status.loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg flex justify-center items-center gap-2 disabled:opacity-50 transition"
        >
          {status.loading ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} />}
          {status.loading ? 'Processing...' : 'Scan & Register'}
        </button>

        {status.message && (
          <div className={`p-3 rounded-lg text-sm ${
            status.type === 'error' ? 'bg-red-50 text-red-700' : 
            status.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
          }`}>
            {status.message}
          </div>
        )}
      </form>
    </div>
  );
}