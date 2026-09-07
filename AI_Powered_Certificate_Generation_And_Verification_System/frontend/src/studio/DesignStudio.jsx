import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Wand2, Keyboard } from 'lucide-react';
import { API } from '../services/api';

import {
  CANVAS_W, CANVAS_H, PAGE_W, emptyTemplate, normalizeTemplate, makeField,
  buildStarterFields, uid, clamp, num
} from './constants';
import { alignDeltas, distributeDeltas, reorderFields, clampField } from './geometry';
import useHistory from './useHistory';
import useStudioKeys from './useStudioKeys';
import Toolbar, { stepZoom } from './Toolbar';
import LeftPanel from './LeftPanel';
import Canvas from './Canvas';
import Inspector from './Inspector';
import LayersPanel from './LayersPanel';
import TemplateGallery from './TemplateGallery';
import PdfPreviewModal from './PdfPreviewModal';

const fitZoom = (width) => clamp(Math.round(((width - 26) / PAGE_W) * 100) / 100, 0.2, 1.5);

const slug = (name) =>
  (name || 'template').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template';

export default function DesignStudio({ notify, onTemplatesChanged }) {
  const history = useHistory(emptyTemplate());
  const template = history.present;
  const fields = template.fields;

  const [templates, setTemplates] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [autoFit, setAutoFit] = useState(true);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [gridSize] = useState(10);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [pdf, setPdf] = useState({ open: false, url: '', loading: false, error: '' });

  const clipboard = useRef([]);
  const nodes = useRef({});
  const autoFitRef = useRef(autoFit);
  autoFitRef.current = autoFit;

  const selectedFields = useMemo(
    () => fields.filter((f) => selectedIds.includes(f.id)),
    [fields, selectedIds]
  );

  /* ------------------------------------------------------------- measuring */

  const registerNode = useCallback((id, el) => {
    if (el) nodes.current[id] = el;
    else delete nodes.current[id];
  }, []);

  // offsetLeft/Top/Width/Height are layout values, so they ignore both the canvas
  // zoom transform and each field's own rotation — exactly what snapping wants.
  const measureBoxes = useCallback((ids) => {
    const out = {};
    for (const id of ids || Object.keys(nodes.current)) {
      const el = nodes.current[id];
      if (el) out[id] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
    }
    return out;
  }, []);

  const onWidthChange = useCallback((width) => {
    if (autoFitRef.current) setZoom(fitZoom(width));
  }, []);

  /* --------------------------------------------------------------- loading */

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/templates`);
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } catch {
      notify?.('Failed to load templates', 'error');
    }
  }, [notify]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // Selection can outlive its fields (undo, delete, loading another template).
  useEffect(() => {
    setSelectedIds((ids) => {
      const alive = ids.filter((id) => fields.some((f) => f.id === id));
      return alive.length === ids.length ? ids : alive;
    });
  }, [fields]);

  const loadTemplate = useCallback((tpl) => {
    history.reset(normalizeTemplate(tpl));
    setSelectedIds([]);
    setPreviewMode(false);
  }, [history]);

  const newTemplate = useCallback(() => {
    history.reset(emptyTemplate());
    setSelectedIds([]);
  }, [history]);

  /* ---------------------------------------------------------- template edit */

  const set = useCallback((key, value) => {
    history.tweak(`tpl:${key}`, (t) => (t[key] === value ? t : { ...t, [key]: value }));
  }, [history]);

  const replaceFields = useCallback((updater) => {
    history.replace((t) => ({ ...t, fields: updater(t.fields) }));
  }, [history]);

  const commitFields = useCallback((updater) => {
    history.commit((t) => ({ ...t, fields: updater(t.fields) }));
  }, [history]);

  const updateField = useCallback((id, patch, coalesceKey) => {
    const updater = (t) => ({
      ...t,
      fields: t.fields.map((f) => (f.id === id ? { ...f, ...patch } : f))
    });
    if (coalesceKey) history.tweak(coalesceKey, updater);
    else history.commit(updater);
  }, [history]);

  const updateSelected = useCallback((patch) => {
    commitFields((list) => list.map((f) => (selectedIds.includes(f.id) ? { ...f, ...patch } : f)));
  }, [commitFields, selectedIds]);

  const addField = useCallback((type) => {
    const stagger = (fields.length % 6) * 14;
    const field = makeField(type, {
      x: Math.round(CANVAS_W / 2 - 120 + stagger),
      y: Math.round(CANVAS_H / 2 - 20 + stagger)
    });
    if (!field) return;
    commitFields((list) => [...list, field]);
    setSelectedIds([field.id]);
  }, [commitFields, fields.length]);

  const removeSelected = useCallback(() => {
    if (!selectedIds.length) return;
    commitFields((list) => list.filter((f) => !selectedIds.includes(f.id)));
    setSelectedIds([]);
  }, [commitFields, selectedIds]);

  const duplicateSelected = useCallback(() => {
    if (!selectedIds.length) return;
    const copies = selectedFields.map((f) => ({
      ...f,
      id: uid(),
      x: num(f.x) + 14,
      y: num(f.y) + 14,
      locked: false
    }));
    commitFields((list) => [...list, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  }, [commitFields, selectedFields, selectedIds.length]);

  const copySelected = useCallback(() => {
    if (!selectedFields.length) return;
    clipboard.current = selectedFields.map((f) => ({ ...f }));
    notify?.(`Copied ${selectedFields.length} field${selectedFields.length === 1 ? '' : 's'}`);
  }, [selectedFields, notify]);

  const pasteClipboard = useCallback(() => {
    if (!clipboard.current.length) return;
    const copies = clipboard.current.map((f) => ({
      ...f,
      id: uid(),
      x: num(f.x) + 18,
      y: num(f.y) + 18
    }));
    commitFields((list) => [...list, ...copies]);
    setSelectedIds(copies.map((c) => c.id));
  }, [commitFields]);

  const nudge = useCallback((dx, dy) => {
    if (!selectedIds.length) return;
    history.tweak('nudge', (t) => ({
      ...t,
      fields: t.fields.map((f) =>
        selectedIds.includes(f.id) && !f.locked
          ? clampField({ ...f, x: num(f.x) + dx, y: num(f.y) + dy })
          : f
      )
    }));
  }, [history, selectedIds]);

  const reorder = useCallback((action) => {
    if (!selectedIds.length) return;
    commitFields((list) => reorderFields(list, selectedIds, action));
  }, [commitFields, selectedIds]);

  const applyDeltas = useCallback((deltas) => {
    if (!Object.keys(deltas).length) return;
    commitFields((list) =>
      list.map((f) => {
        const d = deltas[f.id];
        if (!d || f.locked) return f;
        return clampField({ ...f, x: num(f.x) + d.dx, y: num(f.y) + d.dy });
      })
    );
  }, [commitFields]);

  const align = useCallback((mode) => {
    applyDeltas(alignDeltas(selectedIds, measureBoxes(), mode));
  }, [applyDeltas, measureBoxes, selectedIds]);

  const distribute = useCallback((axis) => {
    applyDeltas(distributeDeltas(selectedIds, measureBoxes(), axis));
  }, [applyDeltas, measureBoxes, selectedIds]);

  const applyStarter = useCallback((layout) => {
    history.commit((t) => ({ ...t, ...layout.patch, fields: buildStarterFields(layout) }));
    setSelectedIds([]);
    notify?.(`Applied “${layout.name}” layout`);
  }, [history, notify]);

  /* ------------------------------------------------------------------ zoom */

  const zoomIn = useCallback(() => { setAutoFit(false); setZoom((z) => stepZoom(z, 1)); }, []);
  const zoomOut = useCallback(() => { setAutoFit(false); setZoom((z) => stepZoom(z, -1)); }, []);
  const zoomFit = useCallback(() => setAutoFit(true), []);

  /* ------------------------------------------------------------ persistence */

  const savePayload = useCallback(() => {
    const { id, ...rest } = template;
    return rest;
  }, [template]);

  const saveTemplate = useCallback(async () => {
    if (!template.name?.trim()) {
      notify?.('Template name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      if (template.id) {
        await axios.put(`${API}/templates/${template.id}`, savePayload());
        notify?.('Template updated successfully');
      } else {
        const res = await axios.post(`${API}/templates`, savePayload());
        const newId = res.data?.template?.id;
        if (newId) history.replace((t) => ({ ...t, id: newId }));
        notify?.('Template created successfully');
      }
      fetchTemplates();
      onTemplatesChanged?.();
    } catch (err) {
      notify?.(err.response?.data?.error || 'Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  }, [template, savePayload, history, notify, fetchTemplates, onTemplatesChanged]);

  const saveAsCopy = useCallback(async () => {
    setSaving(true);
    try {
      const payload = { ...savePayload(), name: `${template.name} (Copy)` };
      const res = await axios.post(`${API}/templates`, payload);
      const newId = res.data?.template?.id;
      history.replace((t) => ({ ...t, id: newId || null, name: payload.name }));
      notify?.('Saved as new template');
      fetchTemplates();
      onTemplatesChanged?.();
    } catch (err) {
      notify?.(err.response?.data?.error || 'Failed to duplicate', 'error');
    } finally {
      setSaving(false);
    }
  }, [savePayload, template.name, history, notify, fetchTemplates, onTemplatesChanged]);

  const deleteTemplate = useCallback(async (target) => {
    const victim = target || template;
    if (!victim.id) { newTemplate(); return; }
    if (!window.confirm(`Delete template "${victim.name}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await axios.delete(`${API}/templates/${victim.id}`);
      notify?.('Template deleted');
      if (victim.id === template.id) newTemplate();
      fetchTemplates();
      onTemplatesChanged?.();
    } catch (err) {
      notify?.(err.response?.data?.error || 'Failed to delete', 'error');
    } finally {
      setSaving(false);
    }
  }, [template, newTemplate, notify, fetchTemplates, onTemplatesChanged]);

  const duplicateFromGallery = useCallback(async (tpl) => {
    setSaving(true);
    try {
      const { id, ...rest } = normalizeTemplate(tpl);
      await axios.post(`${API}/templates`, { ...rest, name: `${rest.name} (Copy)` });
      notify?.('Template duplicated');
      fetchTemplates();
      onTemplatesChanged?.();
    } catch (err) {
      notify?.(err.response?.data?.error || 'Failed to duplicate', 'error');
    } finally {
      setSaving(false);
    }
  }, [notify, fetchTemplates, onTemplatesChanged]);

  /* -------------------------------------------------------- import / export */

  const exportTemplate = useCallback(() => {
    const { id, ...rest } = template;
    const blob = new Blob([JSON.stringify(rest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(template.name)}.certtpl.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    notify?.('Design exported');
  }, [template, notify]);

  const importTemplate = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || typeof data.name !== 'string' || !Array.isArray(data.fields)) {
          notify?.('That file is not a certificate template export', 'error');
          return;
        }
        history.reset(normalizeTemplate({ ...data, id: null }));
        setSelectedIds([]);
        notify?.(`Imported “${data.name}” — save it to keep it`);
      } catch {
        notify?.('Could not read that file', 'error');
      }
    };
    reader.onerror = () => notify?.('Could not read that file', 'error');
    reader.readAsText(file);
  }, [history, notify]);

  /* ------------------------------------------------------------ PDF preview */

  const pdfUrlRef = useRef('');
  useEffect(() => () => { if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current); }, []);

  const renderPdfPreview = useCallback(async () => {
    setPdf((p) => ({ ...p, open: true, loading: true, error: '' }));
    try {
      const res = await axios.post(`${API}/templates/preview-pdf`, savePayload(), { responseType: 'blob' });
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = URL.createObjectURL(res.data);
      setPdf({ open: true, loading: false, error: '', url: pdfUrlRef.current });
    } catch (err) {
      setPdf({ open: true, loading: false, url: '', error: err.response?.status === 404
        ? 'The preview endpoint is unavailable — restart the backend to pick it up.'
        : err.message || 'Rendering failed' });
    }
  }, [savePayload]);

  const closePdf = useCallback(() => setPdf((p) => ({ ...p, open: false })), []);

  /* -------------------------------------------------------------- shortcuts */

  useStudioKeys({
    undo: history.undo,
    redo: history.redo,
    save: saveTemplate,
    duplicate: duplicateSelected,
    copy: copySelected,
    paste: pasteClipboard,
    selectAll: () => setSelectedIds(fields.map((f) => f.id)),
    remove: removeSelected,
    nudge,
    escape: () => {
      if (pdf.open) return closePdf();
      if (galleryOpen) return setGalleryOpen(false);
      setSelectedIds([]);
    },
    bringForward: () => reorder('forward'),
    sendBackward: () => reorder('backward'),
    toggleGrid: () => setGridEnabled((g) => !g),
    togglePreview: () => setPreviewMode((p) => !p),
    zoomIn,
    zoomOut,
    zoomFit
  });

  /* ------------------------------------------------------------------ render */

  return (
    <div data-testid="design-studio-view" className="space-y-4">
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-600 text-white rounded-xl"><Wand2 className="w-5 h-5" /></div>
          <div>
            <h3 className="text-lg font-bold font-serif text-slate-900">Certificate Design Studio</h3>
            <p className="text-xs text-slate-500">
              Pixel-accurate canvas · snapping · layers · undo/redo · real PDF preview
            </p>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 flex items-center gap-1.5 max-w-md">
          <Keyboard className="w-3.5 h-3.5 shrink-0" />
          Ctrl+Z undo · Ctrl+D duplicate · Ctrl+S save · arrows nudge · Shift-click or drag to multi-select · G grid · P preview
        </p>
      </div>

      <Toolbar
        templates={templates}
        currentId={template.id}
        onPickTemplate={(id) => {
          if (!id) return newTemplate();
          const tpl = templates.find((t) => t.id === id);
          if (tpl) loadTemplate(tpl);
        }}
        onOpenGallery={() => setGalleryOpen(true)}
        onNewTemplate={newTemplate}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomFit={zoomFit}
        gridEnabled={gridEnabled}
        onToggleGrid={() => setGridEnabled((g) => !g)}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled((s) => !s)}
        previewMode={previewMode}
        onTogglePreview={() => setPreviewMode((p) => !p)}
        onPdfPreview={renderPdfPreview}
        onExport={exportTemplate}
        onImport={importTemplate}
        onSave={saveTemplate}
        onSaveCopy={saveAsCopy}
        onDelete={() => deleteTemplate()}
        saving={saving}
        isSaved={!!template.id}
      />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-3 space-y-3">
          <LeftPanel
            template={template}
            set={set}
            onAddField={addField}
            onApplyStarter={applyStarter}
            notify={notify}
          />
        </div>

        <div className="xl:col-span-6">
          <Canvas
            template={template}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            previewMode={previewMode}
            zoom={zoom}
            gridEnabled={gridEnabled}
            gridSize={gridSize}
            snapEnabled={snapEnabled}
            onBeginGesture={history.snapshot}
            onFieldsChange={replaceFields}
            onFieldDoubleClick={(e, field) => {
              setSelectedIds([field.id]);
              requestAnimationFrame(() => {
                const el = document.querySelector('[data-testid="ds-field-text"]');
                if (el) { el.focus(); el.select?.(); }
              });
            }}
            onWidthChange={onWidthChange}
            registerNode={registerNode}
            measureBoxes={measureBoxes}
          />
        </div>

        <div className="xl:col-span-3 space-y-3">
          <Inspector
            template={template}
            selectedFields={selectedFields}
            updateField={updateField}
            updateSelected={updateSelected}
            onDuplicate={duplicateSelected}
            onRemove={removeSelected}
            onReorder={reorder}
            onAlign={align}
            onDistribute={distribute}
            notify={notify}
          />
          <LayersPanel
            fields={fields}
            template={template}
            selectedIds={selectedIds}
            onSelect={setSelectedIds}
            onReorder={reorder}
            updateField={updateField}
          />
        </div>
      </div>

      <TemplateGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        templates={templates}
        currentId={template.id}
        onOpenTemplate={loadTemplate}
        onDuplicate={duplicateFromGallery}
        onDelete={deleteTemplate}
        onNew={newTemplate}
      />

      <PdfPreviewModal
        open={pdf.open}
        onClose={closePdf}
        url={pdf.url}
        loading={pdf.loading}
        error={pdf.error}
        filename={`${slug(template.name)}-preview.pdf`}
        onRefresh={renderPdfPreview}
      />
    </div>
  );
}
