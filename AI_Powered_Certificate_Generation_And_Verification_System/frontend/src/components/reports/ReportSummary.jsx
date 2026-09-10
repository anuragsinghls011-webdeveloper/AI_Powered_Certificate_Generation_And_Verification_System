import React from 'react';

export function ReportSummary({ summary }) {
  return (
    <section data-testid="report-summary" aria-label="Selected event summary" className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 min-w-0">
        <p data-testid="report-selected-label" className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected event</p>
        <h2 data-testid="report-event-name" className="mt-2 text-base md:text-lg font-bold text-slate-900 break-words [overflow-wrap:anywhere]">{summary.event.title}</h2>
        <p data-testid="report-event-date" className="mt-2 text-sm text-slate-600 break-words">Event date: {summary.event.date || 'Not specified'}</p>
      </div>
      <dl className="grid grid-cols-3 gap-2 sm:gap-4">
        {[
          ['total', 'Certificates', 'text-slate-900'],
          ['active', 'Active', 'text-emerald-700'],
          ['revoked', 'Revoked', 'text-rose-700']
        ].map(([key, label, color]) => (
          <div key={key} className="rounded-xl border border-slate-200 p-3 sm:p-5 bg-white min-w-0">
            <dt data-testid={`report-${key}-label`} className="text-xs sm:text-sm text-slate-600">{label}</dt>
            <dd data-testid={`report-${key}-count`} className={`mt-2 text-xl sm:text-3xl font-bold tabular-nums break-words ${color}`}>{summary[key].toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      {summary.other > 0 && <p data-testid="report-other-count" className="text-sm text-slate-600">{summary.other.toLocaleString()} certificates have another or unspecified status and are included in the report.</p>}
      {summary.total === 0 && <p data-testid="report-empty-event" role="status" className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">No certificates found for this event.</p>}
    </section>
  );
}