import React from 'react';
import { Download } from 'lucide-react';

export default function PreviewModal({ cert, onClose, apiBase }) {
  if (!cert) return null;

  return (
    <div data-testid="certificate-preview-modal" className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full p-8 relative border-8 border-slate-900 overflow-hidden">
        <button 
          data-testid="close-preview-modal"
          onClick={onClose}
          className="absolute top-4 right-4 bg-slate-100 text-slate-700 hover:bg-slate-200 p-2 rounded-full font-bold transition"
        >
          ✕
        </button>

        {/* Certificate Canvas Mockup */}
        <div className="text-center p-8 border-4 border-amber-500/80 rounded-2xl bg-gradient-to-br from-amber-50/30 via-white to-blue-50/30 relative">
          <div className="absolute top-4 left-4">
            <img src={`data:image/png;base64,${cert.qr_code_b64}`} alt="QR" className="w-20 h-20 border border-slate-300 rounded shadow-sm" />
          </div>

          <span className="text-xs font-mono bg-slate-200 text-slate-700 px-3 py-1 rounded-full">{cert.cert_id}</span>
          
          <h2 className="text-3xl font-bold font-serif text-brand-900 mt-4 tracking-wider">CERTIFICATE OF RECOGNITION</h2>
          <p className="text-sm text-slate-500 mt-1 uppercase tracking-widest font-medium">This is proudly presented to</p>

          <h3 className="text-4xl font-bold font-serif text-slate-900 my-4 border-b-2 border-brand-600/30 pb-2 inline-block px-10">
            {cert.recipient_name}
          </h3>

          <p className="text-sm text-slate-600 max-w-xl mx-auto mt-2">
            For successfully participating with distinction as <span className="font-bold text-brand-600">{cert.role}</span> in the college event:
          </p>

          <h4 className="text-2xl font-bold text-slate-900 mt-2 font-serif">{cert.event_title}</h4>
          <p className="text-xs text-slate-500 mt-1">{cert.grade}</p>

          <div className="mt-12 flex justify-between items-end px-12">
            <div className="text-center">
              <div className="w-40 border-b border-slate-400 mb-1 mx-auto"></div>
              <p className="font-bold text-xs text-slate-800">{cert.issuer_name}</p>
              <p className="text-[10px] text-slate-500">{cert.issuer_title}</p>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-emerald-600">Issued: {cert.issue_date}</p>
              <p className="text-[10px] text-slate-400">CampusCert Secure System</p>
            </div>
            <div className="text-center">
              <div className="w-40 border-b border-slate-400 mb-1 mx-auto"></div>
              <p className="font-bold text-xs text-slate-800">Authorized Signatory</p>
              <p className="text-[10px] text-slate-500">College Academic Council</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <a 
            href={`${apiBase}/certificates/${cert.cert_id}/download-pdf`}
            className="px-6 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl text-sm hover:bg-emerald-700 transition flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Download PDF
          </a>
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-200 text-slate-700 font-semibold rounded-xl text-sm hover:bg-slate-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
