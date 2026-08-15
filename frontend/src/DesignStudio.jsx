import React, { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  Type, Save, Trash2, Upload, Plus, Eye, EyeOff, Palette,
  MoveHorizontal, MoveVertical, Bold, Italic, Copy, Layers, Wand2,
  QrCode, User, Building2, Award, LinkIcon, FileText, RefreshCw
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

// Canvas dimensions (aspect ratio matches landscape LETTER)
const CANVAS_W = 792;
const CANVAS_H = 560;

const FIELD_TYPES = [
  { type: 'recipient_name', label: 'Recipient Name', icon: User, sample: 'Jane Doe' },
  { type: 'organization_name', label: 'Organization', icon: Building2, sample: 'Acme University' },
  { type: 'rank', label: 'Rank / Position', icon: Award, sample: 'First Place' },
  { type: 'event_title', label: 'Event Title', icon: FileText, sample: 'Global AI Hackathon 2025' },
  { type: 'issue_date', label: 'Issue Date', icon: FileText, sample: '2025-10-15' },
  { type: 'certificate_id', label: 'Certificate ID', icon: FileText, sample: 'CERT-2025-A1B2C3' },
  { type: 'certificate_link', label: 'Verification Link', icon: LinkIcon, sample: 'certverify.campus.edu/verify/…' },
  { type: 'certificate_qr', label: 'QR Code', icon: QrCode, sample: 'QR' },
  { type: 'custom_text', label: 'Static Text', icon: Type, sample: 'has successfully completed' },
];

const FONT_FAMILIES = [
  'Helvetica', 'Helvetica-Bold', 'Times-Roman', 'Times-Bold', 'Times-Italic', 'Courier', 'Courier-Bold'
];

const emptyTemplate = () => ({
  id: null,
  name: 'Untitled Template',
  style: 'modern',
  primary_color: '#1e3a8a',
  secondary_color: '#eab308',
  border_style: 'solid',
  issuer_name: 'Dean of Academic Affairs',
  issuer_title: 'University Chancellor',
  background_image: '',
  fields: []
});

export default function DesignStudio({ notify, onTemplatesChanged }) {
  const [templates, setTemplates] = useState([]);
  const [current, setCurrent] = useState(emptyTemplate());
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const canvasRef = useRef(null);
  const dragState = useRef({ id: null, offsetX: 0, offsetY: 0, dragging: false });

  const selectedField = useMemo(
    () => current.fields.find(f => f.id === selectedFieldId) || null,
    [current, selectedFieldId]
  );

  useEffect(() => { fetchTemplates(); }, []);

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${API}/templates`);
      setTemplates(res.data);
    } catch {
      notify?.('Failed to load templates', 'error');
    }
  };

  // Load an existing template for editing
  const loadTemplate = (tpl) => {
    setCurrent({
      id: tpl.id,
      name: tpl.name || 'Untitled Template',
      style: tpl.style || 'modern',
      primary_color: tpl.primary_color || '#1e3a8a',
      secondary_color: tpl.secondary_color || '#eab308',
      border_style: tpl.border_style || 'solid',
      issuer_name: tpl.issuer_name || 'Dean of Academic Affairs',
      issuer_title: tpl.issuer_title || 'University Chancellor',
      background_image: tpl.background_image || '',
      fields: (tpl.fields || []).map(f => ({ ...f, id: f.id || uid() }))
    });
    setSelectedFieldId(null);
  };

  const uid = () => 'f' + Math.random().toString(36).slice(2, 9);

  // Add new field to canvas
  const addField = (typeDef) => {
    const newField = {
      id: uid(),
      type: typeDef.type,
      label: typeDef.label,
      text: typeDef.type === 'custom_text' ? typeDef.sample : '',
      x: Math.round(CANVAS_W / 2 - 80),
      y: Math.round(CANVAS_H / 2 - 15),
      fontFamily: 'Helvetica-Bold',
      fontSize: typeDef.type === 'recipient_name' ? 32 : 16,
      fontWeight: 'bold',
      fontStyle: 'normal',
      color: '#111827',
      width: typeDef.type === 'certificate_qr' ? 80 : 240
    };
    setCurrent(c => ({ ...c, fields: [...c.fields, newField] }));
    setSelectedFieldId(newField.id);
  };

  const updateField = (id, patch) => {
    setCurrent(c => ({
      ...c,
      fields: c.fields.map(f => (f.id === id ? { ...f, ...patch } : f))
    }));
  };

  const deleteField = (id) => {
    setCurrent(c => ({ ...c, fields: c.fields.filter(f => f.id !== id) }));
    if (selectedFieldId === id) setSelectedFieldId(null);
  };

  const duplicateField = (id) => {
    const f = current.fields.find(x => x.id === id);
    if (!f) return;
    const copy = { ...f, id: uid(), x: f.x + 20, y: f.y + 20 };
    setCurrent(c => ({ ...c, fields: [...c.fields, copy] }));
    setSelectedFieldId(copy.id);
  };

  // Mouse-based drag using canvas-relative coordinates
  const onFieldMouseDown = (e, field) => {
    if (previewMode) return;
    e.stopPropagation();
    setSelectedFieldId(field.id);
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const scaleX = CANVAS_W / canvasRect.width;
    const scaleY = CANVAS_H / canvasRect.height;
    dragState.current = {
      id: field.id,
      offsetX: (e.clientX - canvasRect.left) * scaleX - field.x,
      offsetY: (e.clientY - canvasRect.top) * scaleY - field.y,
      dragging: true,
      scaleX, scaleY, canvasRect
    };
  };

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragState.current.dragging) return;
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;
      const scaleX = CANVAS_W / canvasRect.width;
      const scaleY = CANVAS_H / canvasRect.height;
      const newX = Math.round((e.clientX - canvasRect.left) * scaleX - dragState.current.offsetX);
      const newY = Math.round((e.clientY - canvasRect.top) * scaleY - dragState.current.offsetY);
      const clampedX = Math.max(0, Math.min(CANVAS_W - 20, newX));
      const clampedY = Math.max(0, Math.min(CANVAS_H - 20, newY));
      updateField(dragState.current.id, { x: clampedX, y: clampedY });
    };
    const handleUp = () => { dragState.current.dragging = false; };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const handleBackgroundUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      notify?.('Background image must be under 4MB', 'error');
      return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCurrent(c => ({ ...c, background_image: ev.target.result }));
      setUploading(false);
      notify?.('Background image uploaded');
    };
    reader.onerror = () => { setUploading(false); notify?.('Upload failed', 'error'); };
    reader.readAsDataURL(file);
  };

  const clearBackground = () => setCurrent(c => ({ ...c, background_image: '' }));

  // Save template (create or update)
  const saveTemplate = async () => {
    if (!current.name?.trim()) {
      notify?.('Template name is required', 'error');
      return;
    }
    setLoading(true);
    try {
      const payload = { ...current };
      if (current.id) {
        await axios.put(`${API}/templates/${current.id}`, payload);
        notify?.('Template updated successfully');
      } else {
        const res = await axios.post(`${API}/templates`, payload);
        setCurrent(c => ({ ...c, id: res.data.template.id }));
        notify?.('Template created successfully');
      }
      fetchTemplates();
      onTemplatesChanged?.();
    } catch (err) {
      notify?.(err.response?.data?.error || 'Failed to save template', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveAsCopy = async () => {
    setLoading(true);
    try {
      const payload = { ...current, id: undefined, name: current.name + ' (Copy)' };
      const res = await axios.post(`${API}/templates`, payload);
      setCurrent(c => ({ ...c, id: res.data.template.id, name: payload.name }));
      notify?.('Saved as new template');
      fetchTemplates();
      onTemplatesChanged?.();
    } catch {
      notify?.('Failed to duplicate', 'error');
    } finally {
      setLoading(false);
    }
  };

  const deleteTemplate = async () => {
    if (!current.id) { setCurrent(emptyTemplate()); return; }
    if (!window.confirm(`Delete template "${current.name}"? This cannot be undone.`)) return;
    setLoading(true);
    try {
      await axios.delete(`${API}/templates/${current.id}`);
      notify?.('Template deleted');
      setCurrent(emptyTemplate());
      fetchTemplates();
      onTemplatesChanged?.();
    } catch {
      notify?.('Failed to delete', 'error');
    } finally {
      setLoading(false);
    }
  };

  const newTemplate = () => {
    setCurrent(emptyTemplate());
    setSelectedFieldId(null);
  };

  // Render sample text for a field (in preview / canvas)
  const renderFieldText = (f) => {
    if (f.type === 'custom_text') return f.text || 'Sample text';
    const map = {
      recipient_name: 'Jane Doe',
      organization_name: 'Acme University',
      rank: 'First Place',
      event_title: 'Global AI Hackathon 2025',
      issue_date: new Date().toISOString().split('T')[0],
      certificate_id: 'CERT-2025-A1B2C3',
      certificate_link: 'certverify.campus.edu/verify/CERT-2025-A1B2C3'
    };
    return map[f.type] || f.label;
  };

  const borderStyleMap = {
    solid: '4px solid',
    double: '8px double',
    dashed: '3px dashed',
    ridge: '10px ridge',
    none: '0'
  };

  return (
    <div data-testid="design-studio-view" className="space-y-4">
      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="p-2 bg-brand-600 text-white rounded-xl"><Wand2 className="w-5 h-5" /></div>
          <div>
            <h3 className="text-lg font-bold font-serif text-slate-900">Certificate Design Studio</h3>
            <p className="text-xs text-slate-500">Drag fields on the canvas · upload custom backgrounds · edit typography live</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            data-testid="ds-template-picker"
            value={current.id || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__new__') { newTemplate(); return; }
              const tpl = templates.find(t => t.id === val);
              if (tpl) loadTemplate(tpl);
            }}
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-600"
          >
            <option value="__new__">＋ New template</option>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button
            data-testid="ds-toggle-preview"
            onClick={() => setPreviewMode(p => !p)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 border transition ${
              previewMode ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-brand-600'
            }`}
          >
            {previewMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {previewMode ? 'Editing' : 'Live Preview'}
          </button>
          <button
            data-testid="ds-save-template"
            onClick={saveTemplate}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 transition flex items-center gap-2 disabled:opacity-60"
          >
            <Save className="w-4 h-4" /> {current.id ? 'Update' : 'Save'}
          </button>
          {current.id && (
            <button
              data-testid="ds-save-as-copy"
              onClick={saveAsCopy}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 transition flex items-center gap-2"
            >
              <Copy className="w-4 h-4" /> Save as Copy
            </button>
          )}
          <button
            data-testid="ds-delete-template"
            onClick={deleteTemplate}
            className="px-3 py-2 rounded-xl text-sm font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> {current.id ? 'Delete' : 'Reset'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* LEFT SIDEBAR */}
        <aside className="col-span-12 lg:col-span-3 space-y-4">
          {/* Template metadata */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2"><Layers className="w-4 h-4 text-brand-600" /> Template Settings</h4>
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Name</label>
              <input
                data-testid="ds-name-input"
                type="text"
                value={current.name}
                onChange={(e) => setCurrent({ ...current, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Primary</label>
                <input
                  data-testid="ds-primary-color"
                  type="color"
                  value={current.primary_color}
                  onChange={(e) => setCurrent({ ...current, primary_color: e.target.value })}
                  className="w-full h-9 rounded-lg border border-slate-200 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Accent</label>
                <input
                  data-testid="ds-secondary-color"
                  type="color"
                  value={current.secondary_color}
                  onChange={(e) => setCurrent({ ...current, secondary_color: e.target.value })}
                  className="w-full h-9 rounded-lg border border-slate-200 cursor-pointer"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Border Style</label>
              <select
                data-testid="ds-border-style"
                value={current.border_style}
                onChange={(e) => setCurrent({ ...current, border_style: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-600"
              >
                <option value="solid">Solid</option>
                <option value="double">Double</option>
                <option value="dashed">Dashed</option>
                <option value="ridge">Ridge</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Issuer Name</label>
              <input
                type="text"
                value={current.issuer_name}
                onChange={(e) => setCurrent({ ...current, issuer_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Issuer Title</label>
              <input
                type="text"
                value={current.issuer_title}
                onChange={(e) => setCurrent({ ...current, issuer_title: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
              />
            </div>
          </div>

          {/* Background upload */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
            <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2"><Upload className="w-4 h-4 text-brand-600" /> Background Image</h4>
            <label
              data-testid="ds-upload-bg-label"
              className="block cursor-pointer border-2 border-dashed border-slate-300 rounded-xl p-4 text-center text-xs text-slate-500 hover:border-brand-600 hover:bg-brand-50 transition"
            >
              <input
                data-testid="ds-upload-bg-input"
                type="file"
                accept="image/*"
                onChange={handleBackgroundUpload}
                className="hidden"
              />
              {uploading ? (
                <span className="flex items-center gap-2 justify-center"><RefreshCw className="w-4 h-4 animate-spin" /> Uploading…</span>
              ) : (
                <>
                  <Upload className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                  <p className="font-medium">Click to upload</p>
                  <p className="text-[10px] mt-1">PNG / JPG up to 4MB</p>
                </>
              )}
            </label>
            {current.background_image && (
              <div className="flex items-center gap-2">
                <img src={current.background_image} alt="bg" className="w-14 h-10 object-cover rounded-lg border border-slate-200" />
                <button
                  data-testid="ds-clear-bg"
                  onClick={clearBackground}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Field palette */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h4 className="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-brand-600" /> Add Field</h4>
            <div className="grid grid-cols-2 gap-2">
              {FIELD_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.type}
                    data-testid={`ds-add-field-${t.type}`}
                    onClick={() => addField(t)}
                    className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-brand-600 hover:bg-brand-50 transition group"
                  >
                    <Icon className="w-4 h-4 text-brand-600 mb-1 group-hover:scale-110 transition" />
                    <span className="text-[11px] font-semibold text-slate-700 block leading-tight">{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* CANVAS */}
        <section className="col-span-12 lg:col-span-6">
          <div className="bg-slate-100 rounded-2xl p-4 border border-slate-200 shadow-inner">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {previewMode ? 'Live Preview' : 'Editable Canvas'} · {CANVAS_W} × {CANVAS_H}
              </span>
              <span className="text-xs text-slate-400 font-mono">{current.fields.length} fields</span>
            </div>
            <div
              ref={canvasRef}
              data-testid="ds-canvas"
              onClick={() => setSelectedFieldId(null)}
              className="relative bg-white rounded-lg shadow-2xl mx-auto overflow-hidden"
              style={{
                width: '100%',
                aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
                border: current.border_style === 'none' ? undefined : `${borderStyleMap[current.border_style] || '4px solid'} ${current.primary_color}`,
                backgroundImage: current.background_image ? `url(${current.background_image})` : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            >
              {/* Inner accent ring */}
              {current.border_style !== 'none' && (
                <div
                  className="absolute pointer-events-none rounded"
                  style={{
                    inset: '10px',
                    border: `2px solid ${current.secondary_color}`
                  }}
                />
              )}

              {current.fields.map((f) => {
                const isSelected = f.id === selectedFieldId && !previewMode;
                // Convert canvas coords to percent for responsive positioning
                const leftPct = (f.x / CANVAS_W) * 100;
                const topPct = (f.y / CANVAS_H) * 100;
                const commonStyle = {
                  left: `${leftPct}%`,
                  top: `${topPct}%`,
                  fontFamily: (f.fontFamily || 'Helvetica').replace('-Bold', '').replace('-Italic', ''),
                  fontSize: `${(f.fontSize || 16) * 0.9}px`,
                  fontWeight: f.fontWeight || 'normal',
                  fontStyle: f.fontStyle || 'normal',
                  color: f.color || '#111827'
                };

                if (f.type === 'certificate_qr') {
                  return (
                    <div
                      key={f.id}
                      onMouseDown={(e) => onFieldMouseDown(e, f)}
                      onClick={(e) => { e.stopPropagation(); setSelectedFieldId(f.id); }}
                      className={`absolute select-none ${previewMode ? 'cursor-default' : 'cursor-move'} ${isSelected ? 'outline outline-2 outline-brand-600 outline-offset-2' : ''}`}
                      style={{ left: `${leftPct}%`, top: `${topPct}%`, width: '10%', aspectRatio: '1' }}
                      data-testid={`ds-canvas-field-${f.type}`}
                    >
                      <div className="w-full h-full bg-white border border-slate-800 grid place-items-center text-[9px] font-bold text-slate-700">
                        <div className="text-center">
                          <QrCode className="w-6 h-6 mx-auto text-slate-800" />
                          <div className="mt-0.5">QR</div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={f.id}
                    onMouseDown={(e) => onFieldMouseDown(e, f)}
                    onClick={(e) => { e.stopPropagation(); setSelectedFieldId(f.id); }}
                    className={`absolute select-none whitespace-nowrap ${previewMode ? 'cursor-default' : 'cursor-move'} ${isSelected ? 'ring-2 ring-brand-600 ring-offset-2 rounded' : ''}`}
                    style={commonStyle}
                    data-testid={`ds-canvas-field-${f.type}`}
                  >
                    {renderFieldText(f)}
                  </div>
                );
              })}

              {current.fields.length === 0 && (
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center text-slate-400">
                    <Wand2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">Empty canvas</p>
                    <p className="text-xs mt-1">Add fields from the left palette to begin designing</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT INSPECTOR */}
        <aside className="col-span-12 lg:col-span-3">
          {selectedField ? (
            <div data-testid="ds-inspector" className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3 sticky top-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2"><Palette className="w-4 h-4 text-brand-600" /> Field Properties</h4>
                <span className="text-[10px] font-mono bg-brand-50 text-brand-700 px-2 py-0.5 rounded">{selectedField.type}</span>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Label</label>
                <input
                  data-testid="ds-field-label"
                  type="text"
                  value={selectedField.label}
                  onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
                />
              </div>

              {selectedField.type === 'custom_text' && (
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Static Text</label>
                  <textarea
                    data-testid="ds-field-text"
                    rows="2"
                    value={selectedField.text || ''}
                    onChange={(e) => updateField(selectedField.id, { text: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1 flex items-center gap-1"><MoveHorizontal className="w-3 h-3" /> X</label>
                  <input
                    data-testid="ds-field-x"
                    type="number"
                    value={selectedField.x}
                    onChange={(e) => updateField(selectedField.id, { x: parseInt(e.target.value || '0', 10) })}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1 flex items-center gap-1"><MoveVertical className="w-3 h-3" /> Y</label>
                  <input
                    data-testid="ds-field-y"
                    type="number"
                    value={selectedField.y}
                    onChange={(e) => updateField(selectedField.id, { y: parseInt(e.target.value || '0', 10) })}
                    className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
                  />
                </div>
              </div>

              {selectedField.type !== 'certificate_qr' && (
                <>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Font Family</label>
                    <select
                      data-testid="ds-field-font"
                      value={selectedField.fontFamily}
                      onChange={(e) => updateField(selectedField.id, { fontFamily: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:border-brand-600"
                    >
                      {FONT_FAMILIES.map(ff => <option key={ff} value={ff}>{ff}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Font Size ({selectedField.fontSize}px)</label>
                    <input
                      data-testid="ds-field-fontsize"
                      type="range"
                      min="8"
                      max="72"
                      value={selectedField.fontSize}
                      onChange={(e) => updateField(selectedField.id, { fontSize: parseInt(e.target.value, 10) })}
                      className="w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      data-testid="ds-field-bold"
                      onClick={() => updateField(selectedField.id, { fontWeight: selectedField.fontWeight === 'bold' ? 'normal' : 'bold' })}
                      className={`py-2 rounded-lg border text-sm font-semibold flex items-center justify-center gap-1 transition ${
                        selectedField.fontWeight === 'bold' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-200 hover:border-brand-600'
                      }`}
                    >
                      <Bold className="w-4 h-4" /> Bold
                    </button>
                    <button
                      data-testid="ds-field-italic"
                      onClick={() => updateField(selectedField.id, { fontStyle: selectedField.fontStyle === 'italic' ? 'normal' : 'italic' })}
                      className={`py-2 rounded-lg border text-sm font-semibold flex items-center justify-center gap-1 transition ${
                        selectedField.fontStyle === 'italic' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-200 hover:border-brand-600'
                      }`}
                    >
                      <Italic className="w-4 h-4" /> Italic
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">Text Color</label>
                    <input
                      data-testid="ds-field-color"
                      type="color"
                      value={selectedField.color}
                      onChange={(e) => updateField(selectedField.id, { color: e.target.value })}
                      className="w-full h-9 rounded-lg border border-slate-200 cursor-pointer"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  data-testid="ds-field-duplicate"
                  onClick={() => duplicateField(selectedField.id)}
                  className="flex-1 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition flex items-center justify-center gap-1"
                >
                  <Copy className="w-4 h-4" /> Duplicate
                </button>
                <button
                  data-testid="ds-field-delete"
                  onClick={() => deleteField(selectedField.id)}
                  className="flex-1 py-2 rounded-lg bg-rose-50 text-rose-700 text-sm font-semibold hover:bg-rose-100 transition flex items-center justify-center gap-1"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center text-slate-400">
              <Palette className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No field selected</p>
              <p className="text-xs mt-1">Click any field on the canvas to edit its properties</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
