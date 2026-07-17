import React, { useRef, useState, useEffect } from 'react';
import Webcam from 'react-webcam';
import { ScanFace, Activity } from 'lucide-react';
import apiClient from '../api/client';
import { useWebcamCapture } from '../hooks/useWebcamCapture';

export default function AttendanceScanner() {
  const webcamRef = useRef(null);
  const { captureSingleFrame } = useWebcamCapture(webcamRef);
  
  const [isActive, setIsActive] = useState(false);
  
  // Update state to hold both the message and the status type
  const [log, setLog] = useState({ message: 'Awaiting scan...', type: 'info' });
  
  const isProcessingRef = useRef(false);

  useEffect(() => {
    let intervalId;

    const analyzeFrame = async () => {
      if (!isActive || isProcessingRef.current) return;
      
      const blob = captureSingleFrame();
      if (!blob) return;

      isProcessingRef.current = true;
      setLog({ message: 'Analyzing frame...', type: 'info' });

      const formData = new FormData();
      formData.append('image', blob, 'live_frame.jpg');

      try {
        // Await the response from the server
        const response = await apiClient.post('/attendance', formData);
        
        // Update the UI with the exact message from the Python backend!
        setLog({ 
          message: response.data.message, 
          type: response.data.status 
        });

      } catch (error) {
        setLog({ message: 'Network error connecting to AI server.', type: 'error' });
      } finally {
        isProcessingRef.current = false;
      }
    };

    if (isActive) {
      intervalId = setInterval(analyzeFrame, 3000);
    }

    return () => clearInterval(intervalId);
  }, [isActive, captureSingleFrame]);

  // Determine the background color based on the AI's status
  const getLogColor = () => {
    switch(log.type) {
      case 'success': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'warning': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'error': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-50 text-gray-500 border-gray-200';
    }
  };

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
        className={`w-full font-medium py-3 px-4 rounded-lg flex justify-center items-center gap-2 transition mb-4 ${
          isActive ? 'bg-red-50 hover:bg-red-100 text-red-700' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
        }`}
      >
        <Activity size={20} />
        {isActive ? 'Halt Surveillance Loop' : 'Initialize Live Scanning'}
      </button>

      {/* Dynamic Status Box */}
      <div className={`text-center text-sm font-medium py-3 px-4 rounded border transition-colors duration-300 ${getLogColor()}`}>
        {log.message}
      </div>
    </div>
  );
}