import React from 'react';
import { FileText, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { Modal } from './ui';

/**
 * Shows the template rendered by the *server* (POST /api/templates/preview-pdf),
 * so it is the final word on what a certificate will look like — the canvas is
 * a faithful preview, this is the actual PDF.
 */
export default function PdfPreviewModal({ open, onClose, url, loading, error, filename, onRefresh }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={FileText}
      title="PDF Preview"
      subtitle="Rendered by the certificate engine with sample data"
      testId="ds-pdf-modal"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            Recipient details are placeholders; real certificates use the recipient’s data.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              data-testid="ds-pdf-refresh"
              className="px-3 py-2 rounded-lg text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Re-render
            </button>
            <a
              href={url || '#'}
              download={filename || 'template-preview.pdf'}
              data-testid="ds-pdf-download"
              className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 transition ${
                url ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-200 text-slate-400 pointer-events-none'
              }`}
            >
              <Download className="w-4 h-4" />
              Download
            </a>
          </div>
        </div>
      }
    >
      <div className="bg-slate-200 rounded-xl overflow-hidden" style={{ height: '68vh' }}>
        {error ? (
          <div className="h-full grid place-items-center text-center p-6">
            <div>
              <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">Could not render the preview</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md">{error}</p>
            </div>
          </div>
        ) : loading || !url ? (
          <div className="h-full grid place-items-center">
            <div className="text-center text-slate-500">
              <RefreshCw className="w-7 h-7 mx-auto mb-2 animate-spin" />
              <p className="text-sm font-medium">Rendering PDF…</p>
            </div>
          </div>
        ) : (
          <iframe
            src={url}
            title="Certificate PDF preview"
            data-testid="ds-pdf-frame"
            className="w-full h-full border-0 bg-white"
          />
        )}
      </div>
    </Modal>
  );
}
