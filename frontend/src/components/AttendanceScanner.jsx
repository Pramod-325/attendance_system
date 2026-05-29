import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { ScanFace, Activity } from 'lucide-react';
import apiClient from '../api/client';
import { useWebcamCapture } from '../hooks/useWebcamCapture';

export default function AttendanceScanner() {
  const webcamRef = useRef(null);
  const { captureSingleFrame } = useWebcamCapture(webcamRef);
  
  const [isActive, setIsActive] = useState(false);
  const [lastLog, setLastLog] = useState('Awaiting scan...');

  useEffect(() => {
    let intervalId;

    const analyzeFrame = async () => {
      if (!isActive) return;
      
      const blob = captureSingleFrame();
      if (!blob) return;

      const formData = new FormData();
      formData.append('image', blob, 'live_frame.jpg');

      try {
        // We use a non-blocking background post
        apiClient.post('/attendance', formData);
        setLastLog(`Frame analyzed at ${new Date().toLocaleTimeString()}`);
      } catch (error) {
        console.warn("Frame analysis failed:", error);
      }
    };

    if (isActive) {
      // Poll every 3 seconds to balance server load and responsiveness
      intervalId = setInterval(analyzeFrame, 3000);
    }

    // Cleanup interval on unmount or toggle
    return () => clearInterval(intervalId);
  }, [isActive, captureSingleFrame]);

  return (
    <div className="max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-6 border-b pb-4">
        <div className="flex items-center gap-2">
          <ScanFace className="text-emerald-600" />
          <h2 className="text-xl font-semibold text-gray-800">Classroom Scanner</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Status:</span>
          <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden bg-gray-900 aspect-video mb-4 ring-4 ring-gray-100">
        <Webcam
          audio={false}
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ facingMode: "environment", width: 640, height: 480 }}
          className="w-full h-full object-cover"
        />
      </div>

      <button
        onClick={() => setIsActive(!isActive)}
        className={`w-full font-medium py-3 px-4 rounded-lg flex justify-center items-center gap-2 transition ${
          isActive ? 'bg-red-50 hover:bg-red-100 text-red-700' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
        }`}
      >
        <Activity size={20} />
        {isActive ? 'Halt Surveillance Loop' : 'Initialize Live Scanning'}
      </button>

      <div className="mt-4 text-center text-xs text-gray-500 font-mono bg-gray-50 py-2 rounded">
        {lastLog}
      </div>
    </div>
  );
}