import React from 'react';
import {
  Award, Calendar, FileText, ShieldCheck, Plus, Download,
  Sparkles, Layers
} from 'lucide-react';

export default function DashboardPage({
  analytics, events, certificates, setActiveTab,
  setBulkData, bulkData, setPreviewCert, apiBase
}) {
  return (
    <div data-testid="dashboard-view" className="space-y-8">
      <div className="bg-gradient-to-r from-brand-900 via-brand-700 to-indigo-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 translate-x-10 -translate-y-10">
          <Award className="w-96 h-96" />
        </div>
        <div className="relative z-10 max-w-2xl">
          <span className="bg-brand-500/30 border border-brand-400/30 text-brand-100 text-xs px-3 py-1 rounded-full uppercase font-semibold tracking-wider">
            Automated Academic & Event Issuance
          </span>
          <h2 className="text-3xl md:text-4xl font-bold font-serif mt-3">Streamline College Certificates with QR Verification</h2>
          <p className="text-slate-200 mt-2 text-sm md:text-base">
            Automate the creation, bulk issuance, digital signatures, and instant QR verification for workshops, hackathons, conferences, and seminars.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <button 
              data-testid="goto-bulk-btn"
              onClick={() => setActiveTab('bulk')}
              className="bg-white text-brand-900 font-semibold px-6 py-3 rounded-xl shadow-lg hover:bg-slate-100 transition flex items-center gap-2"
            >
              <Plus className="w-5 h-5 text-brand-600" /> Generate Bulk Certificates
            </button>
            <button 
              data-testid="goto-verify-btn"
              onClick={() => setActiveTab('verify')}
              className="bg-brand-600/60 border border-white/30 text-white font-semibold px-6 py-3 rounded-xl hover:bg-brand-600 transition flex items-center gap-2"
            >
              <ShieldCheck className="w-5 h-5" /> Verify a Certificate
            </button>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div data-testid="stat-total-certs" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 bg-blue-50 text-brand-600 rounded-2xl">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Total Issued</p>
            <h3 className="text-2xl font-bold text-slate-900">{analytics?.total_certificates || 0}</h3>
          </div>
        </div>

        <div data-testid="stat-events" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Calendar className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">College Events</p>
            <h3 className="text-2xl font-bold text-slate-900">{analytics?.total_events || 0}</h3>
          </div>
        </div>

        <div data-testid="stat-templates" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl">
            <Layers className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Templates</p>
            <h3 className="text-2xl font-bold text-slate-900">{analytics?.total_templates || 0}</h3>
          </div>
        </div>

        <div data-testid="stat-active" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
          <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <p className="text-sm text-slate-500 font-medium">Active & Valid</p>
            <h3 className="text-2xl font-bold text-slate-900">{analytics?.active_certificates || 0}</h3>
          </div>
        </div>
      </div>

      {/* Recent Certificates & Events Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold font-serif text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-600" /> Recent Issued Certificates
            </h3>
            <button 
              onClick={() => setActiveTab('repository')}
              className="text-sm text-brand-600 hover:text-brand-700 font-semibold"
            >
              View All →
            </button>
          </div>
          {certificates.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No certificates issued yet. Go to Bulk Generator to issue certificates.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {certificates.slice(0, 5).map((cert) => (
                <div key={cert.cert_id} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition">
                  <div>
                    <p className="font-semibold text-slate-900">{cert.recipient_name}</p>
                    <p className="text-xs text-slate-500">{cert.event_title} • <span className="text-brand-600 font-medium">{cert.role}</span></p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono bg-slate-200 text-slate-700 px-2.5 py-1 rounded-md">{cert.cert_id}</span>
                    <button 
                      data-testid={`preview-cert-${cert.cert_id}`}
                      onClick={() => setPreviewCert(cert)}
                      className="p-2 text-brand-600 hover:bg-brand-50 rounded-lg transition"
                      title="Preview Certificate"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <a 
                      href={`${apiBase}/certificates/${cert.cert_id}/download-pdf`}
                      className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Events Panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold font-serif text-slate-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-emerald-600" /> Active Events
            </h3>
            <div className="space-y-3">
              {events.map((ev) => (
                <div key={ev.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">{ev.category}</span>
                    <span className="text-xs text-slate-500">{ev.date}</span>
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm mt-1">{ev.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Organizer: {ev.organizer}</p>
                </div>
              ))}
            </div>
          </div>
          <button 
            onClick={() => setActiveTab('events')}
            className="mt-6 w-full py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" /> Manage & Add Events
          </button>
        </div>
      </div>
    </div>
  );
}
