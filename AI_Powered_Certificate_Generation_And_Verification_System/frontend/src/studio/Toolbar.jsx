import React, { useRef } from 'react';
import {
  LayoutTemplate, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Grid3x3, Magnet,
  Eye, EyeOff, FileText, Download, Upload, Save, Copy, Trash2, FilePlus2
} from 'lucide-react';
import { IconButton } from './ui';

const ZOOM_STEPS = [0.25, 0.4, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2];

/** Nudges zoom to the next/previous preset step. */
export function stepZoom(zoom, dir) {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > zoom + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  const lower = ZOOM_STEPS.filter((z) => z < zoom - 0.001);
  return lower.length ? lower[lower.length - 1] : ZOOM_STEPS[0];
}

const Divider = () => <span className="w-px self-stretch bg-slate-200 mx-0.5" />;

export default function Toolbar({
  templates,
  currentId,
  onPickTemplate,
  onOpenGallery,
  onNewTemplate,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomFit,
  gridEnabled,
  onToggleGrid,
  snapEnabled,
  onToggleSnap,
  previewMode,
  onTogglePreview,
  onPdfPreview,
  onExport,
  onImport,
  onSave,
  onSaveCopy,
  onDelete,
  saving,
  isSaved
}) {
  const importRef = useRef(null);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 flex flex-wrap items-center gap-2">
      {/* Template switching */}
      <select
        data-testid="ds-template-picker"
        value={currentId || ''}
        onChange={(e) => onPickTemplate(e.target.value)}
        title="Switch template"
        className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold bg-white min-w-[11rem] max-w-[16rem] focus:outline-none focus:border-brand-600"
      >
        <option value="">Unsaved design</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>

      <IconButton icon={LayoutTemplate} title="Browse template gallery" testId="ds-open-gallery" onClick={onOpenGallery} />
      <IconButton icon={FilePlus2} title="Start a blank template" testId="ds-new-template" onClick={onNewTemplate} />

      <Divider />

      <IconButton icon={Undo2} title="Undo (Ctrl+Z)" testId="ds-undo" onClick={onUndo} disabled={!canUndo} />
      <IconButton icon={Redo2} title="Redo (Ctrl+Shift+Z)" testId="ds-redo" onClick={onRedo} disabled={!canRedo} />

      <Divider />

      <div className="flex items-center gap-1">
        <IconButton icon={ZoomOut} title="Zoom out (Ctrl+-)" testId="ds-zoom-out" onClick={onZoomOut} />
        <button
          type="button"
          onClick={onZoomFit}
          data-testid="ds-zoom-level"
          title="Fit to width (Ctrl+0)"
          className="px-2 py-2 text-xs font-mono font-semibold text-slate-600 hover:text-brand-700 min-w-[3.25rem]"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton icon={ZoomIn} title="Zoom in (Ctrl+=)" testId="ds-zoom-in" onClick={onZoomIn} />
        <IconButton icon={Maximize2} title="Fit to width (Ctrl+0)" testId="ds-zoom-fit" onClick={onZoomFit} />
      </div>

      <Divider />

      <IconButton
        icon={Grid3x3}
        title="Toggle grid (G)"
        testId="ds-toggle-grid"
        active={gridEnabled}
        onClick={onToggleGrid}
      />
      <IconButton
        icon={Magnet}
        title="Snap to guides"
        testId="ds-toggle-snap"
        active={snapEnabled}
        onClick={onToggleSnap}
      />

      <div className="flex-1" />

      {/* Output */}
      <button
        type="button"
        data-testid="ds-toggle-preview"
        onClick={onTogglePreview}
        title="Toggle preview mode (P)"
        className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 border transition ${
          previewMode
            ? 'bg-brand-600 text-white border-brand-600'
            : 'bg-white text-slate-700 border-slate-200 hover:border-brand-600'
        }`}
      >
        {previewMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        {previewMode ? 'Editing' : 'Preview'}
      </button>

      <button
        type="button"
        data-testid="ds-pdf-preview"
        onClick={onPdfPreview}
        title="Render this design as a real PDF"
        className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 bg-slate-900 text-white hover:bg-slate-800 transition"
      >
        <FileText className="w-4 h-4" />
        PDF
      </button>

      <Divider />

      <IconButton icon={Download} title="Export design as .certtpl.json" testId="ds-export" onClick={onExport} />
      <IconButton
        icon={Upload}
        title="Import a .certtpl.json design"
        testId="ds-import"
        onClick={() => importRef.current?.click()}
      />
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        data-testid="ds-import-input"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onImport(file);
        }}
      />

      <Divider />

      <button
        type="button"
        data-testid="ds-save-template"
        onClick={onSave}
        disabled={saving}
        title="Save template (Ctrl+S)"
        className="px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving…' : isSaved ? 'Save' : 'Create'}
      </button>

      <IconButton
        icon={Copy}
        title="Save as a copy"
        testId="ds-save-as-copy"
        onClick={onSaveCopy}
        disabled={saving}
      />
      <IconButton
        icon={Trash2}
        title="Delete this template"
        testId="ds-delete-template"
        onClick={onDelete}
        tone="danger"
        disabled={!isSaved}
      />
    </div>
  );
}
