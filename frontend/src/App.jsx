import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router';
import RegistrationCamera from './components/RegistrationCamera';
import AttendanceScanner from './components/AttendanceScanner';
import { ShieldCheck } from 'lucide-react';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
        <nav className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm sticky top-0 z-10">
          <div className="max-w-5xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2 text-blue-900 font-bold text-xl">
              <ShieldCheck size={28} className="text-blue-600" />
              <span>EdgeVision Admin</span>
            </div>
            <div className="flex gap-6 font-medium text-sm text-slate-600">
              <Link to="/" className="hover:text-blue-600 transition">Registration</Link>
              <Link to="/scanner" className="hover:text-emerald-600 transition">Live Scanner</Link>
            </div>
          </div>
        </nav>

        <main className="max-w-5xl mx-auto p-6 mt-8">
          <Routes>
            <Route path="/" element={<RegistrationCamera />} />
            <Route path="/scanner" element={<AttendanceScanner />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;