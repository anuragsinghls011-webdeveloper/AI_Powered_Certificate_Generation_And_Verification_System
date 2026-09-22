import React from 'react';
import { Award, Sparkles, Upload } from 'lucide-react';

export default function BulkGeneratorPage({
  events, templates, bulkData, setBulkData,
  loading, onBulkGenerate, onFileUpload
}) {
  const selectedTemplate = templates.find(t => t.id === bulkData.template_id);
  
  // Data fields that are genuinely per-participant (excludes issue_date, event_title which are global)
  const DATA_FIELD_TYPES = ['recipient_name', 'recipient_email', 'rank', 'score', 'organization_name', 'custom_text', 'text_block'];
  
  const templateFields = selectedTemplate?.fields
    ?.filter(f => DATA_FIELD_TYPES.includes(f.type) && f.visible !== false)
    ?.map(f => {
      if (f.type === 'recipient_email') return 'email';
      if (f.type === 'custom_text' || f.type === 'text_block') return (f.label || f.type).toLowerCase().replace(/\\s+/g, '_');
      return f.type;
    }) 
    || ['recipient_name', 'email', 'rank', 'score'];
    
  // Ensure we at least have recipient_name
  const requiredFields = Array.from(new Set(['recipient_name', ...templateFields]));
  const headerRowStr = requiredFields.join(', ');
  
  const exampleData = requiredFields.map(f => {
    if (f === 'recipient_name') return 'Alice Johnson';
    if (f === 'email') return 'alice@college.edu';
    if (f === 'rank') return 'Winner';
    if (f === 'score') return '95%';
    if (f === 'organization_name') return 'Acme University';
    return 'Value';
  }).join(', ');
  return (
    <div data-testid="bulk-generator-view" className="space-y-8 max-w-4xl mx-auto">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="border-b border-slate-100 pb-4 mb-6">
          <h3 className="text-xl font-bold font-serif text-slate-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-brand-600" /> Bulk Certificate Generator
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Select an event and certificate template, then paste or input participant details to auto-generate unique certificate IDs and QR codes.
          </p>
        </div>

        <form onSubmit={onBulkGenerate} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">Select Event</label>
              <select 
                data-testid="bulk-event-select"
                value={bulkData.event_id}
                onChange={e => setBulkData({...bulkData, event_id: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600 bg-white"
              >
                {events.map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.title} ({ev.category})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">Certificate Template Style</label>
              <select 
                data-testid="bulk-template-select"
                value={bulkData.template_id}
                onChange={e => setBulkData({...bulkData, template_id: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600 bg-white"
              >
                {templates.map(tpl => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name} - Signer: {tpl.issuer_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">Issue Date</label>
            <input 
              type="date" 
              value={bulkData.issue_date}
              onChange={e => setBulkData({...bulkData, issue_date: e.target.value})}
              className="w-full md:w-1/2 px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                Participants List (Header row required: {headerRowStr})
              </label>
              <div className="flex items-center gap-3">
                <label className="cursor-pointer text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 bg-brand-50 px-2.5 py-1 rounded-md transition hover:bg-brand-100">
                  <Upload className="w-3.5 h-3.5" /> Upload CSV/Excel
                  <input data-testid="bulk-participant-file-input" type="file" accept=".csv, .xlsx, .xls" className="hidden" onChange={onFileUpload} />
                </label>
                <span className="text-xs text-slate-400">First line must be header row</span>
              </div>
            </div>
            <textarea 
              data-testid="participants-textarea"
              rows="6"
              value={bulkData.participantsText}
              onChange={e => setBulkData({...bulkData, participantsText: e.target.value})}
              placeholder={`${headerRowStr}\n${exampleData}\nBob Smith, bob@college.edu, Participant, 88%`}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:border-brand-600"
            ></textarea>
          </div>

          <button 
            data-testid="generate-certificates-submit"
            type="submit" 
            disabled={loading}
            className="w-full py-4 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 transition shadow-lg flex items-center justify-center gap-2"
          >
            <Award className="w-5 h-5" /> {loading ? 'Generating Certificates...' : 'Generate & Issue All Certificates'}
          </button>
        </form>
      </div>
    </div>
  );
}
