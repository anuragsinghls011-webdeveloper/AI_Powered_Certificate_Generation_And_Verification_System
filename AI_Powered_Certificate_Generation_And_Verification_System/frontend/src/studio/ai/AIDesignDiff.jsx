import React from 'react';
import { Check, Eye, X } from 'lucide-react';
import CertificateSurface from '../CertificateSurface';

export default function AIDesignDiff({ choice, index, onApply, onCancel, onPreview }) {
  if (!choice) return null;
  return (
    <section data-testid={`ai-proposal-${index}`} className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 to-white px-4 py-3">
        <p data-testid={`ai-proposal-title-${index}`} className="text-xs font-bold text-slate-900">{choice.name || 'Proposed changes'}</p>
        <p data-testid={`ai-proposal-summary-${index}`} className="text-[11px] leading-relaxed text-slate-600 mt-1">{choice.design.summary}</p>
      </div>
      <div className="p-3 space-y-3">
        <div className="w-full overflow-hidden rounded-xl bg-slate-100 border border-slate-200 flex justify-center py-3">
          <CertificateSurface template={choice.template} scale={0.33} testId={`ai-variant-surface-${index}`} />
        </div>
        {choice.diff.length > 0 && (
          <div className="space-y-1 max-h-36 overflow-auto" data-testid={`ai-change-list-${index}`}>
            {choice.diff.map((line, i) => (
              <p key={i} data-testid={`ai-change-${index}-${i}`} className="flex gap-2 text-[11px] text-slate-600 leading-snug">
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />{line}
              </p>
            ))}
          </div>
        )}
        {choice.design.warnings?.map((warning, i) => (
          <p key={i} data-testid={`ai-warning-${index}-${i}`} className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">{warning}</p>
        ))}
        <div className="flex gap-2">
          <button data-testid={`ai-preview-${index}`} type="button" onClick={onPreview}
            className="flex-1 flex justify-center items-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors">
            <Eye className="h-3.5 w-3.5" /> Preview
          </button>
          <button data-testid={`ai-apply-${index}`} type="button" onClick={onApply} disabled={!choice.diff.length}
            className="flex-1 flex justify-center items-center gap-1.5 rounded-xl bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-40 transition-colors">
            <Check className="h-3.5 w-3.5" /> Apply
          </button>
          <button data-testid={`ai-cancel-${index}`} type="button" onClick={onCancel} aria-label="Discard this proposal"
            className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}