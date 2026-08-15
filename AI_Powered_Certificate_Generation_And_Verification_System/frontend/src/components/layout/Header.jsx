import React from 'react';
import { Award, Wand2, Rocket } from 'lucide-react';

export default function Header({ activeTab, setActiveTab, certificateCount }) {
  return (
    <header className="bg-slate-900 text-white shadow-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand-600 p-2.5 rounded-xl shadow-inner text-white">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-serif tracking-tight">CampusCert Pro</h1>
            <p className="text-xs text-slate-400">Centralized Certificate Generation & Management System</p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-800 p-1 rounded-xl border border-slate-700">
          <button 
            data-testid="nav-dashboard"
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'dashboard' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
          >
            Dashboard
          </button>
          <button 
            data-testid="nav-events"
            onClick={() => setActiveTab('events')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'events' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
          >
            Events
          </button>
          <button 
            data-testid="nav-bulk"
            onClick={() => setActiveTab('bulk')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'bulk' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
          >
            Bulk Generator
          </button>
          <button 
            data-testid="nav-bulk-studio"
            onClick={() => setActiveTab('bulk-studio')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${activeTab === 'bulk-studio' ? 'bg-indigo-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
          >
            <Rocket className="w-4 h-4" /> Bulk Studio
          </button>
          <button 
            data-testid="nav-repository"
            onClick={() => setActiveTab('repository')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'repository' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
          >
            Repository ({certificateCount})
          </button>
          <button 
            data-testid="nav-design-studio"
            onClick={() => setActiveTab('design')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${activeTab === 'design' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
          >
            <Wand2 className="w-4 h-4" /> Design Studio
          </button>
          <button 
            data-testid="nav-verify"
            onClick={() => setActiveTab('verify')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition ${activeTab === 'verify' ? 'bg-brand-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
          >
            Verify Portal
          </button>
        </div>
      </div>
    </header>
  );
}
