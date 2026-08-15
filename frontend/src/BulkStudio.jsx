// Smart Bulk Certificate Generation — 8-step stepper UI.
// State machine kept in this parent; each step is a lightweight component.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle,
  Wand2, Download, RefreshCw, X, Play, Pause, Eye, FileText, Search, ChevronDown,
  Save, Trash2, Rocket, Loader2, Settings, Layers, ListChecks
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const STEPS = [
  { key: 'upload', label: 'Upload', icon: Upload },
  { key: 'preview', label: 'Preview', icon: FileSpreadsheet },
  { key: 'map', label: 'Map Fields', icon: Wand2 },
  { key: 'validate', label: 'Validate', icon: ListChecks },
  { key: 'template', label: 'Template', icon: Layers },
  { key: 'sample', label: 'Sample', icon: Eye },
  { key: 'configure', label: 'Configure', icon: Settings },
  { key: 'generate', label: 'Generate', icon: Rocket },
];

const FIELD_OPTIONS = [
  { value: '', label: '— Ignore —' },
  { value: 'recipient_name', label: 'Recipient Name *' },
  { value: 'email', label: 'Email' },
  { value: 'event_title', label: 'Event / Course' },
  { value: 'issue_date', label: 'Issue Date' },
  { value: 'organization_name', label: 'Organization' },
  { value: 'rank', label: 'Rank / Role' },
  { value: 'score', label: 'Score / Grade' },
  { value: 'certificate_id', label: 'External ID' },
];

export default function BulkStudio({ notify }) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx].key;

  // Shared state across steps
  const [limits, setLimits] = useState({ max_file_size: 10485760, max_rows: 5000, max_columns: 50, supported_formats: ['csv', 'xlsx', 'xls'] });
  const [uploadInfo, setUploadInfo] = useState(null); // { upload_id, file_name, file_size, headers, row_count, preview }
  const [previewPage, setPreviewPage] = useState({ page: 1, size: 25, rows: [], total: 0 });
  const [mapping, setMapping] = useState({});
  const [defaults, setDefaults] = useState({ issue_date: new Date().toISOString().split('T')[0] });
  const [validation, setValidation] = useState(null); // { summary, validated }
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [samplePdfUrl, setSamplePdfUrl] = useState('');
  const [jobSettings, setJobSettings] = useState({
    filename_pattern: '{{recipient_name}}_{{certificate_id}}.pdf',
    email_enabled: true,
    zip_enabled: true,
    skip_invalid: true,
    skip_duplicates: true,
  });
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [jobHistory, setJobHistory] = useState([]);
  const [savedMappings, setSavedMappings] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [l, t, jh, sm] = await Promise.all([
          axios.get(`${API}/bulk/limits`),
          axios.get(`${API}/templates`),
          axios.get(`${API}/bulk/jobs`),
          axios.get(`${API}/bulk/saved-mappings`),
        ]);
        setLimits(l.data);
        setTemplates(t.data);
        setJobHistory(jh.data);
        setSavedMappings(sm.data);
      } catch (e) { /* ignore */ }
    })();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const goto = (idx) => setStepIdx(Math.max(0, Math.min(STEPS.length - 1, idx)));
  const nextStep = () => goto(stepIdx + 1);
  const prevStep = () => goto(stepIdx - 1);

  // ---------- STEP 1: UPLOAD ----------
  const uploadFile = async (file) => {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!limits.supported_formats.includes(ext)) {
      notify?.(`Unsupported file. Use: ${limits.supported_formats.join(', ')}`, 'error');
      return;
    }
    if (file.size > limits.max_file_size) {
      notify?.(`File too large. Max ${(limits.max_file_size / 1024 / 1024).toFixed(0)}MB`, 'error');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await axios.post(`${API}/bulk/upload`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setUploadInfo(res.data);
      // Auto-suggest
      const sug = await axios.post(`${API}/bulk/uploads/${res.data.upload_id}/suggest-mapping`, {
        template_id: selectedTemplateId || undefined
      });
      const auto = {};
      Object.entries(sug.data.auto_suggestions || {}).forEach(([h, v]) => { auto[h] = v.fieldType || ''; });
      setMapping(auto);
      notify?.(`Parsed ${res.data.row_count} row(s) from ${res.data.file_name}`);
      setStepIdx(1);
    } catch (err) {
      notify?.(err.response?.data?.error || 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const downloadSample = (fmt) => {
    window.location.href = `${API}/bulk/sample-template?format=${fmt}`;
  };

  // ---------- STEP 2: PREVIEW (paginated) ----------
  const loadPreviewPage = useCallback(async (page = 1, size = 25) => {
    if (!uploadInfo) return;
    const res = await axios.get(`${API}/bulk/uploads/${uploadInfo.upload_id}/preview`, { params: { page, size } });
    setPreviewPage(res.data);
  }, [uploadInfo]);

  useEffect(() => {
    if (step === 'preview' && uploadInfo && previewPage.rows.length === 0) {
      loadPreviewPage(1, 25);
    }
  }, [step, uploadInfo, previewPage.rows.length, loadPreviewPage]);

  // ---------- STEP 4: VALIDATE ----------
  const runValidation = async () => {
    try {
      const res = await axios.post(`${API}/bulk/uploads/${uploadInfo.upload_id}/validate`, {
        mapping, defaults, required_fields: []
      });
      setValidation(res.data);
      return res.data;
    } catch (err) {
      notify?.('Validation failed', 'error');
      return null;
    }
  };

  useEffect(() => {
    if (step === 'validate' && uploadInfo) runValidation();
  }, [step, uploadInfo]);

  // ---------- STEP 6: SAMPLE PREVIEW ----------
  const generateSamplePreview = async () => {
    if (!selectedTemplateId || !uploadInfo) return;
    try {
      const res = await axios.post(`${API}/bulk/preview-sample`, {
        upload_id: uploadInfo.upload_id,
        template_id: selectedTemplateId,
        mapping, defaults, row_index: 0
      }, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      setSamplePdfUrl(url);
    } catch (err) {
      notify?.('Sample preview failed', 'error');
    }
  };

  // ---------- STEP 8: GENERATE + POLL ----------
  const startGeneration = async () => {
    try {
      const res = await axios.post(`${API}/bulk/jobs`, {
        upload_id: uploadInfo.upload_id,
        template_id: selectedTemplateId,
        mapping, defaults,
        settings: jobSettings,
        skip_invalid: jobSettings.skip_invalid,
        skip_duplicates: jobSettings.skip_duplicates
      });
      setActiveJobId(res.data.job_id);
      notify?.(`Job ${res.data.job_id} queued`);
      startPolling(res.data.job_id);
    } catch (err) {
      notify?.(err.response?.data?.error || 'Failed to start job', 'error');
    }
  };

  const startPolling = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const res = await axios.get(`${API}/bulk/jobs/${jobId}`);
        setActiveJob(res.data);
        if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(res.data.status)) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          const jh = await axios.get(`${API}/bulk/jobs`);
          setJobHistory(jh.data);
        }
      } catch (e) { /* ignore */ }
    };
    tick();
    pollRef.current = setInterval(tick, 1500);
  };

  const cancelJob = async () => {
    if (!activeJobId) return;
    await axios.post(`${API}/bulk/jobs/${activeJobId}/cancel`);
    notify?.('Cancellation requested');
  };

  const retryFailed = async () => {
    if (!activeJobId) return;
    try {
      await axios.post(`${API}/bulk/jobs/${activeJobId}/retry`);
      notify?.('Retrying failed records…');
      startPolling(activeJobId);
    } catch (err) {
      notify?.(err.response?.data?.error || 'Retry failed', 'error');
    }
  };

  const resendEmails = async () => {
    if (!activeJobId) return;
    const res = await axios.post(`${API}/bulk/jobs/${activeJobId}/resend-emails`);
    notify?.(res.data.message);
  };

  const downloadZip = (jobId) => {
    window.location.href = `${API}/bulk/jobs/${jobId || activeJobId}/download`;
  };

  const downloadErrors = () => {
    if (!uploadInfo) return;
    window.location.href = `${API}/bulk/uploads/${uploadInfo.upload_id}/errors.csv`;
  };

  const saveCurrentMapping = async () => {
    const name = window.prompt('Mapping name:', uploadInfo?.file_name || 'My mapping');
    if (!name) return;
    await axios.post(`${API}/bulk/saved-mappings`, { name, mapping, defaults });
    const sm = await axios.get(`${API}/bulk/saved-mappings`);
    setSavedMappings(sm.data);
    notify?.('Mapping saved');
  };

  const applySavedMapping = (id) => {
    const found = savedMappings.find((m) => m.id === id);
    if (!found) return;
    // Only apply headers that exist in the current file
    const applied = {};
    for (const h of uploadInfo.headers) {
      if (found.mapping[h]) applied[h] = found.mapping[h];
    }
    setMapping({ ...mapping, ...applied });
    if (found.defaults) setDefaults({ ...defaults, ...found.defaults });
    notify?.(`Applied mapping "${found.name}"`);
  };

  // ---------- Validation summary derived counts ----------
  const canGoNext = (() => {
    switch (step) {
      case 'upload': return !!uploadInfo;
      case 'preview': return !!uploadInfo;
      case 'map': return Object.values(mapping).includes('recipient_name');
      case 'validate': return validation && (validation.summary.valid > 0 || jobSettings.include_invalid);
      case 'template': return !!selectedTemplateId;
      case 'sample': return !!selectedTemplateId;
      case 'configure': return true;
      default: return false;
    }
  })();

  // ---------------- RENDER ----------------
  return (
    <div data-testid="bulk-studio-view" className="space-y-6">
      {/* Header */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 text-white rounded-xl"><Rocket className="w-5 h-5" /></div>
          <div>
            <h3 className="text-lg font-bold font-serif text-slate-900">Smart Bulk Studio</h3>
            <p className="text-xs text-slate-500">Upload CSV/Excel · validate · design → generate hundreds of certificates in the background</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            data-testid="bs-download-sample-csv"
            onClick={() => downloadSample('csv')}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:border-indigo-600 text-slate-700 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Sample CSV
          </button>
          <button
            data-testid="bs-download-sample-xlsx"
            onClick={() => downloadSample('xlsx')}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:border-indigo-600 text-slate-700 flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Sample Excel
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-1 overflow-x-auto">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <React.Fragment key={s.key}>
                <button
                  data-testid={`bs-step-${s.key}`}
                  onClick={() => i <= stepIdx && goto(i)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    active ? 'bg-indigo-600 text-white' :
                    done ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer' :
                    'bg-slate-50 text-slate-500'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full grid place-items-center text-[10px] ${
                    active ? 'bg-white/20' : done ? 'bg-emerald-600 text-white' : 'bg-slate-200'
                  }`}>{done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}</span>
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 min-h-[400px]">
        {step === 'upload' && (
          <UploadStep
            uploading={uploading}
            uploadInfo={uploadInfo}
            dragOver={dragOver}
            setDragOver={setDragOver}
            onFile={uploadFile}
            limits={limits}
            resetUpload={() => { setUploadInfo(null); setMapping({}); setValidation(null); }}
          />
        )}
        {step === 'preview' && uploadInfo && (
          <PreviewStep
            uploadInfo={uploadInfo}
            page={previewPage}
            loadPage={loadPreviewPage}
          />
        )}
        {step === 'map' && uploadInfo && (
          <MappingStep
            headers={uploadInfo.headers}
            rows={uploadInfo.preview}
            mapping={mapping}
            setMapping={setMapping}
            defaults={defaults}
            setDefaults={setDefaults}
            savedMappings={savedMappings}
            applySavedMapping={applySavedMapping}
            saveCurrentMapping={saveCurrentMapping}
          />
        )}
        {step === 'validate' && (
          <ValidationStep
            validation={validation}
            runValidation={runValidation}
            downloadErrors={downloadErrors}
            uploadInfo={uploadInfo}
          />
        )}
        {step === 'template' && (
          <TemplateStep
            templates={templates}
            selectedId={selectedTemplateId}
            setSelectedId={setSelectedTemplateId}
          />
        )}
        {step === 'sample' && (
          <SampleStep
            samplePdfUrl={samplePdfUrl}
            generate={generateSamplePreview}
            selectedTemplateId={selectedTemplateId}
          />
        )}
        {step === 'configure' && (
          <ConfigureStep
            settings={jobSettings}
            setSettings={setJobSettings}
            defaults={defaults}
            setDefaults={setDefaults}
            validation={validation}
          />
        )}
        {step === 'generate' && (
          <GenerateStep
            activeJob={activeJob}
            activeJobId={activeJobId}
            start={startGeneration}
            cancel={cancelJob}
            retry={retryFailed}
            resendEmails={resendEmails}
            downloadZip={downloadZip}
            reset={() => { setActiveJobId(null); setActiveJob(null); setStepIdx(0); setUploadInfo(null); }}
          />
        )}
      </div>

      {/* Nav */}
      {step !== 'generate' && (
        <div className="flex justify-between">
          <button
            data-testid="bs-prev-btn"
            disabled={stepIdx === 0}
            onClick={prevStep}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 disabled:opacity-40 hover:border-indigo-600 flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <button
            data-testid="bs-next-btn"
            disabled={!canGoNext}
            onClick={nextStep}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-2"
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Job history */}
      <JobHistoryPanel
        jobs={jobHistory}
        onOpen={(jobId) => { setActiveJobId(jobId); startPolling(jobId); setStepIdx(STEPS.length - 1); }}
        onDownload={downloadZip}
      />
    </div>
  );
}

// ============ STEP COMPONENTS ============

function UploadStep({ uploading, uploadInfo, dragOver, setDragOver, onFile, limits, resetUpload }) {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h4 className="text-lg font-bold font-serif text-slate-900">Step 1 · Upload Participant Data</h4>
        <p className="text-sm text-slate-500 mt-1">Drop your CSV or Excel file below. Max {(limits.max_file_size / 1024 / 1024).toFixed(0)}MB · up to {limits.max_rows.toLocaleString()} rows.</p>
      </div>
      {!uploadInfo ? (
        <label
          data-testid="bs-drop-zone"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files?.[0]); }}
          className={`block cursor-pointer border-2 border-dashed rounded-2xl p-12 text-center transition ${
            dragOver ? 'border-indigo-600 bg-indigo-50' : 'border-slate-300 hover:border-indigo-600 hover:bg-slate-50'
          }`}
        >
          <input
            data-testid="bs-file-input"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => onFile(e.target.files?.[0])}
            className="hidden"
            disabled={uploading}
          />
          {uploading ? (
            <div className="flex flex-col items-center text-slate-600">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-2" />
              <p className="font-semibold">Uploading & parsing…</p>
            </div>
          ) : (
            <>
              <Upload className="w-14 h-14 text-slate-400 mx-auto mb-3" />
              <p className="font-bold text-slate-900 text-lg">Drag & drop CSV or Excel</p>
              <p className="text-sm text-slate-500 mt-1">or click to browse</p>
              <p className="text-xs text-slate-400 mt-4 font-mono">Supported: {limits.supported_formats.join(', ').toUpperCase()}</p>
            </>
          )}
        </label>
      ) : (
        <div data-testid="bs-uploaded-file" className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 text-white rounded-xl"><FileSpreadsheet className="w-5 h-5" /></div>
            <div>
              <p className="font-bold text-slate-900">{uploadInfo.file_name}</p>
              <p className="text-xs text-slate-600">{(uploadInfo.file_size / 1024).toFixed(1)} KB · {uploadInfo.headers.length} columns · <strong>{uploadInfo.row_count.toLocaleString()} records</strong></p>
            </div>
          </div>
          <button
            data-testid="bs-remove-file"
            onClick={resetUpload}
            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewStep({ uploadInfo, page, loadPage }) {
  const totalPages = Math.max(1, Math.ceil(page.total / page.size));
  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-lg font-bold font-serif text-slate-900">Step 2 · Data Preview</h4>
        <p className="text-sm text-slate-500 mt-1">{uploadInfo.row_count.toLocaleString()} records loaded from <span className="font-mono">{uploadInfo.file_name}</span></p>
      </div>
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto max-h-[420px]">
          <table data-testid="bs-preview-table" className="w-full text-sm border-collapse">
            <thead className="bg-slate-100 sticky top-0">
              <tr>
                <th className="p-2 text-left text-[11px] font-bold text-slate-500 uppercase border-b border-slate-200 w-10">#</th>
                {uploadInfo.headers.map((h) => (
                  <th key={h} className="p-2 text-left text-[11px] font-bold text-slate-600 uppercase border-b border-slate-200 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row, i) => (
                <tr key={i} className="odd:bg-white even:bg-slate-50/40 hover:bg-indigo-50">
                  <td className="p-2 text-xs text-slate-400 font-mono">{(page.page - 1) * page.size + i + 1}</td>
                  {uploadInfo.headers.map((h) => (
                    <td key={h} className={`p-2 text-slate-700 whitespace-nowrap ${!row[h] ? 'text-slate-300 italic' : ''}`}>
                      {row[h] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-500">Page {page.page} of {totalPages}</span>
        <div className="flex gap-2">
          <button
            data-testid="bs-preview-prev"
            disabled={page.page <= 1}
            onClick={() => loadPage(page.page - 1, page.size)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 disabled:opacity-40"
          >Prev</button>
          <button
            data-testid="bs-preview-next"
            disabled={page.page >= totalPages}
            onClick={() => loadPage(page.page + 1, page.size)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 disabled:opacity-40"
          >Next</button>
        </div>
      </div>
    </div>
  );
}

function MappingStep({ headers, rows, mapping, setMapping, defaults, setDefaults, savedMappings, applySavedMapping, saveCurrentMapping }) {
  const hasRecipient = Object.values(mapping).includes('recipient_name');
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h4 className="text-lg font-bold font-serif text-slate-900">Step 3 · Map Columns</h4>
          <p className="text-sm text-slate-500 mt-1">Auto-detected mappings shown. Adjust and add fixed defaults.</p>
        </div>
        <div className="flex gap-2">
          {savedMappings.length > 0 && (
            <select
              data-testid="bs-apply-saved-mapping"
              defaultValue=""
              onChange={(e) => { if (e.target.value) applySavedMapping(e.target.value); e.target.value = ''; }}
              className="px-3 py-2 rounded-xl text-sm border border-slate-200 bg-white"
            >
              <option value="">Apply saved mapping…</option>
              {savedMappings.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <button
            data-testid="bs-save-mapping"
            onClick={saveCurrentMapping}
            className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 hover:border-indigo-600 flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" /> Save mapping
          </button>
        </div>
      </div>

      {!hasRecipient && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Please map at least one column to <strong>Recipient Name</strong> to continue.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {headers.map((h) => {
          const sampleVal = rows?.[0]?.[h];
          return (
            <div key={h} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-slate-500 uppercase">Column</p>
                  <p className="font-bold text-slate-900 truncate" title={h}>{h}</p>
                  {sampleVal && <p className="text-xs text-slate-400 mt-1 truncate">e.g. {sampleVal}</p>}
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 mt-6" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-slate-500 uppercase">Maps to</p>
                  <select
                    data-testid={`bs-map-${h.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`}
                    value={mapping[h] || ''}
                    onChange={(e) => setMapping({ ...mapping, [h]: e.target.value })}
                    className={`w-full mt-1 px-2 py-1.5 rounded-lg border text-sm bg-white ${
                      mapping[h] ? 'border-indigo-300' : 'border-slate-200'
                    }`}
                  >
                    {FIELD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-4 rounded-xl border border-slate-200 bg-white">
        <h5 className="font-bold text-sm text-slate-900 mb-2">Fixed defaults</h5>
        <p className="text-xs text-slate-500 mb-3">Values that will apply to every certificate when the column is missing.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {['event_title', 'issue_date', 'organization_name'].map((k) => (
            <div key={k}>
              <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">{k.replace('_', ' ')}</label>
              <input
                data-testid={`bs-default-${k}`}
                type={k === 'issue_date' ? 'date' : 'text'}
                value={defaults[k] || ''}
                onChange={(e) => setDefaults({ ...defaults, [k]: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-indigo-600"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ValidationStep({ validation, runValidation, downloadErrors, uploadInfo }) {
  if (!validation) return <div className="text-center text-slate-400 py-8">Validating…</div>;
  const { summary, validated } = validation;
  const invalidRows = validated.filter((r) => r.status !== 'valid' && r.status !== 'valid_with_warnings').slice(0, 50);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h4 className="text-lg font-bold font-serif text-slate-900">Step 4 · Validation</h4>
          <p className="text-sm text-slate-500 mt-1">Records will only be generated if they pass required-field and format checks.</p>
        </div>
        <div className="flex gap-2">
          <button data-testid="bs-revalidate" onClick={runValidation} className="px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Re-run
          </button>
          {summary.invalid + summary.duplicate > 0 && (
            <button data-testid="bs-download-errors" onClick={downloadErrors} className="px-3 py-2 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Error CSV
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard testid="bs-summary-total" label="Total" value={summary.total} color="slate" />
        <StatCard testid="bs-summary-valid" label="Valid" value={summary.valid} color="emerald" />
        <StatCard testid="bs-summary-invalid" label="Invalid" value={summary.invalid} color="rose" />
        <StatCard testid="bs-summary-duplicate" label="Duplicates" value={summary.duplicate} color="amber" />
      </div>

      {invalidRows.length === 0 ? (
        <div data-testid="bs-all-valid" className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
          <p className="font-bold text-emerald-800">All records look great — ready to generate!</p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="p-2 text-left text-[11px] font-bold text-slate-500 uppercase w-14">Row</th>
                  <th className="p-2 text-left text-[11px] font-bold text-slate-500 uppercase">Errors</th>
                  <th className="p-2 text-left text-[11px] font-bold text-slate-500 uppercase">Data</th>
                </tr>
              </thead>
              <tbody data-testid="bs-error-rows">
                {invalidRows.map((r) => (
                  <tr key={r.rowNumber} className="border-t border-slate-100 hover:bg-rose-50/30">
                    <td className="p-2 font-mono text-xs text-slate-500">{r.rowNumber}</td>
                    <td className="p-2">
                      {r.errors.map((e, i) => (
                        <div key={i} className="text-xs text-rose-700 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {e.message}</div>
                      ))}
                    </td>
                    <td className="p-2 text-xs text-slate-600 truncate max-w-md" title={JSON.stringify(r.row)}>{JSON.stringify(r.row).slice(0, 100)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ testid, label, value, color }) {
  const colors = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200'
  };
  return (
    <div data-testid={testid} className={`p-4 rounded-xl border ${colors[color]}`}>
      <p className="text-xs font-semibold uppercase opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}

function TemplateStep({ templates, selectedId, setSelectedId }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-lg font-bold font-serif text-slate-900">Step 5 · Choose Certificate Template</h4>
        <p className="text-sm text-slate-500 mt-1">Pick a template from your library. Design new ones in the Design Studio tab.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((t) => {
          const active = t.id === selectedId;
          return (
            <button
              key={t.id}
              data-testid={`bs-template-card-${t.id}`}
              onClick={() => setSelectedId(t.id)}
              className={`p-4 rounded-2xl border-2 text-left transition ${
                active ? 'border-indigo-600 bg-indigo-50 shadow-md' : 'border-slate-200 hover:border-indigo-400 bg-white'
              }`}
            >
              <div className="flex justify-between items-start">
                <h5 className="font-bold text-slate-900">{t.name}</h5>
                {active && <CheckCircle2 className="w-5 h-5 text-indigo-600" />}
              </div>
              <p className="text-xs text-slate-500 mt-1">Issuer: {t.issuer_name}</p>
              <div className="flex gap-2 mt-3">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: t.primary_color, color: 'white' }}>Primary</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border" style={{ borderColor: t.secondary_color, color: t.secondary_color }}>Accent</span>
              </div>
              <p className="text-xs text-slate-400 mt-3">{(t.fields || []).length} fields · {t.border_style} border</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SampleStep({ samplePdfUrl, generate, selectedTemplateId }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-lg font-bold font-serif text-slate-900">Step 6 · Preview Sample</h4>
        <p className="text-sm text-slate-500 mt-1">Render a sample using the first row&apos;s data to confirm everything looks right.</p>
      </div>
      <div className="flex gap-2">
        <button
          data-testid="bs-generate-sample"
          onClick={generate}
          disabled={!selectedTemplateId}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 flex items-center gap-2"
        >
          <Wand2 className="w-4 h-4" /> Render Sample Certificate
        </button>
      </div>
      {samplePdfUrl && (
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <iframe data-testid="bs-sample-iframe" src={samplePdfUrl} title="Sample" className="w-full h-[520px] bg-slate-100" />
        </div>
      )}
    </div>
  );
}

function ConfigureStep({ settings, setSettings, validation, defaults, setDefaults }) {
  const willGenerate = validation ? validation.summary.valid + (settings.include_invalid ? validation.summary.invalid : 0) : 0;
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-lg font-bold font-serif text-slate-900">Step 7 · Configure Generation</h4>
        <p className="text-sm text-slate-500 mt-1">Final settings before we start the background job.</p>
      </div>

      <div className="p-4 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center gap-3">
        <Rocket className="w-6 h-6 text-indigo-600" />
        <div>
          <p className="font-bold text-slate-900">Ready to generate <span data-testid="bs-will-generate-count" className="text-indigo-700">{willGenerate}</span> certificates</p>
          <p className="text-xs text-slate-600">{validation?.summary?.invalid || 0} invalid & {validation?.summary?.duplicate || 0} duplicate records will be skipped.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 space-y-3">
          <h5 className="font-bold text-sm text-slate-900">Output</h5>
          <div>
            <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Filename pattern</label>
            <input
              data-testid="bs-filename-pattern"
              type="text"
              value={settings.filename_pattern}
              onChange={(e) => setSettings({ ...settings, filename_pattern: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
            />
            <p className="text-[10px] text-slate-500 mt-1">Tokens: <code>&#123;&#123;recipient_name&#125;&#125;</code>, <code>&#123;&#123;certificate_id&#125;&#125;</code></p>
          </div>
          <Toggle testid="bs-toggle-zip" label="Generate ZIP bundle" checked={settings.zip_enabled} onChange={(v) => setSettings({ ...settings, zip_enabled: v })} />
        </div>

        <div className="p-4 rounded-xl border border-slate-200 space-y-3">
          <h5 className="font-bold text-sm text-slate-900">Delivery & Skipping</h5>
          <Toggle testid="bs-toggle-email" label="Send certificates via email (mock)" checked={settings.email_enabled} onChange={(v) => setSettings({ ...settings, email_enabled: v })} />
          <Toggle testid="bs-toggle-skip-invalid" label="Skip invalid rows" checked={settings.skip_invalid} onChange={(v) => setSettings({ ...settings, skip_invalid: v })} />
          <Toggle testid="bs-toggle-skip-duplicates" label="Skip duplicate rows" checked={settings.skip_duplicates} onChange={(v) => setSettings({ ...settings, skip_duplicates: v })} />
        </div>
      </div>
    </div>
  );
}

function Toggle({ testid, label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input data-testid={testid} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}

function GenerateStep({ activeJob, activeJobId, start, cancel, retry, resendEmails, downloadZip, reset }) {
  if (!activeJobId) {
    return (
      <div className="text-center py-12">
        <Rocket className="w-14 h-14 text-indigo-600 mx-auto mb-3" />
        <h4 className="text-2xl font-bold font-serif text-slate-900">Ready to launch</h4>
        <p className="text-sm text-slate-500 mt-2 mb-6">Kick off the background job. You can leave this page — the worker keeps running.</p>
        <button
          data-testid="bs-start-job"
          onClick={start}
          className="px-6 py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg flex items-center gap-2 mx-auto"
        >
          <Rocket className="w-5 h-5" /> Start Bulk Generation
        </button>
      </div>
    );
  }

  const total = activeJob?.total_records || 0;
  const processed = activeJob?.processed_records || 0;
  const successful = activeJob?.successful_records || 0;
  const failed = activeJob?.failed_records || 0;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const status = activeJob?.status || 'queued';
  const finished = ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(status);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h4 className="text-lg font-bold font-serif text-slate-900">Step 8 · Generation</h4>
          <p className="text-sm text-slate-500 mt-1">Job <span className="font-mono text-indigo-700">{activeJobId}</span></p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200">
        <div className="flex justify-between items-baseline mb-2">
          <span data-testid="bs-progress-label" className="text-2xl font-bold text-slate-900">{pct}%</span>
          <span className="text-sm text-slate-600">{processed.toLocaleString()} / {total.toLocaleString()} processed</span>
        </div>
        <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
          <div
            data-testid="bs-progress-bar"
            className="h-3 bg-gradient-to-r from-indigo-500 to-indigo-700 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <StatCard testid="bs-live-total" label="Total" value={total} color="slate" />
          <StatCard testid="bs-live-processed" label="Processed" value={processed} color="slate" />
          <StatCard testid="bs-live-success" label="Successful" value={successful} color="emerald" />
          <StatCard testid="bs-live-failed" label="Failed" value={failed} color="rose" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!finished && (
          <button data-testid="bs-cancel-job" onClick={cancel} className="px-4 py-2 rounded-xl text-sm font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 flex items-center gap-2">
            <X className="w-4 h-4" /> Cancel
          </button>
        )}
        {finished && failed > 0 && (
          <button data-testid="bs-retry-failed" onClick={retry} className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Retry Failed ({failed})
          </button>
        )}
        {finished && successful > 0 && (
          <>
            <button data-testid="bs-download-zip" onClick={() => downloadZip()} className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-2">
              <Download className="w-4 h-4" /> Download ZIP ({successful})
            </button>
            <button data-testid="bs-resend-emails" onClick={resendEmails} className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 hover:border-indigo-600 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" /> Resend Emails
            </button>
          </>
        )}
        {finished && (
          <button data-testid="bs-new-job" onClick={reset} className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 hover:border-indigo-600 flex items-center gap-2">
            <Rocket className="w-4 h-4" /> Start New Bulk Job
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    queued: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Queued' },
    processing: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Processing…' },
    completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' },
    completed_with_errors: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Completed with errors' },
    failed: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Failed' },
    cancelled: { bg: 'bg-slate-200', text: 'text-slate-700', label: 'Cancelled' }
  };
  const s = map[status] || map.queued;
  return <span data-testid="bs-status-badge" className={`px-3 py-1 rounded-full text-xs font-bold ${s.bg} ${s.text}`}>{s.label}</span>;
}

function JobHistoryPanel({ jobs, onOpen, onDownload }) {
  if (!jobs || jobs.length === 0) return null;
  return (
    <div data-testid="bs-history-panel" className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-600" /> Recent Bulk Jobs</h4>
        <span className="text-xs text-slate-400">{jobs.length} total</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="p-2 text-left text-[10px] font-bold text-slate-500 uppercase">Job ID</th>
              <th className="p-2 text-left text-[10px] font-bold text-slate-500 uppercase">Source</th>
              <th className="p-2 text-left text-[10px] font-bold text-slate-500 uppercase">Total</th>
              <th className="p-2 text-left text-[10px] font-bold text-slate-500 uppercase">✓</th>
              <th className="p-2 text-left text-[10px] font-bold text-slate-500 uppercase">✗</th>
              <th className="p-2 text-left text-[10px] font-bold text-slate-500 uppercase">Status</th>
              <th className="p-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.slice(0, 10).map((j) => (
              <tr key={j.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="p-2 font-mono text-xs text-indigo-700">{j.id}</td>
                <td className="p-2 text-xs text-slate-600 truncate max-w-[240px]">{j.source_file_name}</td>
                <td className="p-2 text-xs">{j.total_records}</td>
                <td className="p-2 text-xs text-emerald-700">{j.successful_records}</td>
                <td className="p-2 text-xs text-rose-700">{j.failed_records}</td>
                <td className="p-2"><StatusBadge status={j.status} /></td>
                <td className="p-2 text-right space-x-1">
                  <button data-testid={`bs-open-job-${j.id}`} onClick={() => onOpen(j.id)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="Open">
                    <Eye className="w-4 h-4" />
                  </button>
                  {j.successful_records > 0 && (
                    <button data-testid={`bs-dl-job-${j.id}`} onClick={() => onDownload(j.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Download ZIP">
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
