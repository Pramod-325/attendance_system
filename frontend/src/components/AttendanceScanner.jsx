import React, { useState } from 'react';
import { ScanFace, Activity, RefreshCw } from 'lucide-react';
import apiClient from '../api/client';
import ActiveLiveness from './ActiveLiveness';

export default function AttendanceScanner() {
  const [log, setLog] = useState({ message: 'Complete the challenges to mark attendance.', type: 'info' });
  const [resetKey, setResetKey] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleLivenessPassed = async (verifiedBlob) => {
    setIsProcessing(true);
    setLog({ message: 'Transmitting verified frame to AI server...', type: 'info' });

    const formData = new FormData();
    formData.append('image', verifiedBlob, 'verified_live_frame.jpg');

    try {
      const response = await apiClient.post('/attendance', formData);
      setLog({
        message: response.data.message || 'Attendance Logged!',
        type: response.data.status || 'success'
      });
    } catch (error) {
      setLog({
        message: error.response?.data?.detail || 'Face not recognized or network error.',
        type: 'error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetScanner = () => {
    setLog({ message: 'Complete the challenges to mark attendance.', type: 'info' });
    setResetKey(prev => prev + 1);
  };

  const getLogColor = () => {
    switch (log.type) {
      case 'success': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'warning': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'error': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-blue-50 text-blue-800 border-blue-200';
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
          <span className="text-sm text-gray-500">Mode:</span>
          <span className="px-2 py-0.5 text-xs font-bold rounded bg-emerald-100 text-emerald-700">Active Liveness</span>
        </div>
      </div>

      <ActiveLiveness onVerified={handleLivenessPassed} resetTrigger={resetKey} />

      <div className="mt-4 flex flex-col gap-3">
        <div className={`text-center text-sm font-medium py-3 px-4 rounded border transition-colors duration-300 ${getLogColor()}`}>
          {isProcessing ? 'Processing face vector...' : log.message}
        </div>

        <button
          onClick={handleResetScanner}
          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2.5 px-4 rounded-lg flex justify-center items-center gap-2 transition"
        >
          <RefreshCw size={18} />
          Scan Next Student
        </button>
      </div>
    </div>
  );
}