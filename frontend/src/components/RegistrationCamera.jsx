import React, { useState } from 'react';
import { UserPlus, Loader2, ShieldCheck } from 'lucide-react';
import apiClient from '../api/client';
import ActiveLiveness from './ActiveLiveness';

export default function RegistrationCamera() {
  const [studentName, setStudentName] = useState('');
  const [status, setStatus] = useState({ loading: false, message: '', type: '' });
  const [verifiedBlob, setVerifiedBlob] = useState(null);
  const [resetKey, setResetKey] = useState(0);

  const handleLivenessVerified = (blob) => {
    setVerifiedBlob(blob);
    setStatus({
      loading: false,
      message: 'Liveness passed! Enter student name and click submit.',
      type: 'success'
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!studentName.trim()) {
      setStatus({ loading: false, message: 'Student name is required.', type: 'error' });
      return;
    }
    if (!verifiedBlob) {
      setStatus({ loading: false, message: 'Please complete the liveness challenge first.', type: 'error' });
      return;
    }

    setStatus({ loading: true, message: 'Transmitting telemetry to server...', type: 'info' });

    try {
      const formData = new FormData();
      formData.append('name', studentName.trim());
      formData.append('images', verifiedBlob, 'verified_enrolment.jpg');

      await apiClient.post('/register', formData);

      setStatus({ loading: false, message: 'Registration queued successfully!', type: 'success' });
      setStudentName('');
      setVerifiedBlob(null);
      setResetKey(prev => prev + 1);
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
        <ActiveLiveness onVerified={handleLivenessVerified} resetTrigger={resetKey} />

        <input
          type="text"
          placeholder="Enter Legal Name"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition mt-2"
          disabled={status.loading}
        />

        <button
          type="submit"
          disabled={status.loading || !verifiedBlob}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg flex justify-center items-center gap-2 disabled:opacity-50 transition"
        >
          {status.loading ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={20} />}
          {status.loading ? 'Processing...' : 'Register Student'}
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