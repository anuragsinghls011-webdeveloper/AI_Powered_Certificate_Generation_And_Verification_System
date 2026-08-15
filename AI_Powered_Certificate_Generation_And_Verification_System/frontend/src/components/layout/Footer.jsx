import React from 'react';
import { CheckCircle2 } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-6 border-t border-slate-800 mt-auto">
      <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
        <p>© 2025 CampusCert Pro. Centralized Certificate Generation & Management System for College Events.</p>
        <div className="flex gap-6">
          <span className="text-emerald-400 flex items-center gap-1 font-medium"><CheckCircle2 className="w-3.5 h-3.5" /> System Operational</span>
          <span>MongoDB Connected</span>
          <span>Node.js Backend</span>
        </div>
      </div>
    </footer>
  );
}
