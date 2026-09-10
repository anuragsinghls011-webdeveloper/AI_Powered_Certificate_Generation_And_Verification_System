import React from 'react';
import { FileSpreadsheet, Download, Loader2, ShieldCheck, RefreshCw } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import useEventReports from '../hooks/useEventReports';
import { ReportSummary } from '../components/reports/ReportSummary';

export default function EventReportsPage() {
  const { membership, organization } = useAuth();
  if (!['admin', 'super_admin'].includes(membership?.role)) {
    return <p data-testid="reports-access-denied" role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-900">Event Reports is available to organization admins only.</p>;
  }
  return <ReportsContent key={organization?.id} organizationId={organization?.id} />;
}

function ReportsContent({ organizationId }) {
  const report = useEventReports(organizationId);
  const disabled = !report.selectedId || !report.summary?.total || report.summary.event.id !== report.selectedId || report.loadingSummary || !!report.generating;
  return (
    <div data-testid="event-reports-page" className="space-y-8 min-w-0">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-brand-100 text-brand-700 shrink-0"><FileSpreadsheet className="w-6 h-6" aria-hidden="true" /></div>
        <div className="min-w-0">
          <h1 data-testid="reports-heading" className="text-4xl sm:text-5xl font-bold font-serif tracking-tight text-slate-900">Event Reports</h1>
          <p data-testid="reports-description" className="text-sm sm:text-base text-slate-600 mt-3">Select an event. Download the details that matter.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
        <section data-testid="report-controls" aria-label="Generate an event report" className="lg:col-span-2 bg-white p-5 sm:p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6 min-w-0">
          <div className="space-y-2 min-w-0">
            <label data-testid="report-event-selector-label" htmlFor="report-event" className="block text-sm font-semibold text-slate-700">Select event</label>
            <select id="report-event" data-testid="report-event-selector" value={report.selectedId}
              disabled={report.loadingEvents || !!report.generating || !report.events.length}
              onChange={event => report.setSelectedId(event.target.value)}
              className="block w-full min-w-0 max-w-full truncate px-4 py-3 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-500">
              <option data-testid="report-event-option-default" value="">{report.loadingEvents ? 'Loading events…' : 'Choose an event'}</option>
              {report.events.map(event => <option data-testid={`report-event-option-${event.id}`} key={event.id} value={event.id}>{event.title}{event.date ? ` — ${event.date.slice(0, 10)}` : ''}</option>)}
            </select>
          </div>

          {report.loadingSummary && <p data-testid="report-summary-loading" role="status" className="flex items-center gap-2 text-sm text-slate-600"><Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> Loading event summary…</p>}
          {report.summary && report.summary.event.id === report.selectedId && <ReportSummary summary={report.summary} />}
          {!report.loadingEvents && !report.events.length && !report.error && <p data-testid="reports-no-events" role="status" className="text-sm text-slate-600">No events are available for your organization. Create an event in Events to get started.</p>}
          {!report.selectedId && report.events.length > 0 && <p data-testid="reports-selection-hint" className="text-sm text-slate-500 py-4">Choose an event to see certificate totals and generate a report.</p>}

          {report.error && <div data-testid="report-error" role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 space-y-3">
            <p data-testid="report-error-message">{report.error}</p>
            <button data-testid="report-retry" onClick={report.reload} disabled={!!report.generating} className="flex items-center gap-2 font-semibold underline underline-offset-4 disabled:opacity-50"><RefreshCw aria-hidden="true" className="w-4 h-4" /> Reload events</button>
          </div>}
          {report.success && <p data-testid="report-success" role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{report.success}</p>}
          {report.generating && <p data-testid="report-generating" role="status" className="flex items-center gap-2 text-sm text-brand-700"><Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> Generating report…</p>}

          <div className="flex flex-col sm:flex-row gap-3 pt-5 border-t border-slate-100" aria-busy={!!report.generating}>
            {['xlsx', 'csv'].map(format => <button key={format} data-testid={`report-generate-${format}`} disabled={disabled} onClick={() => report.generate(format)}
              className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50 disabled:cursor-not-allowed ${format === 'xlsx' ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
              {report.generating === format ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Download aria-hidden="true" className="w-4 h-4" />}
              Generate {format === 'xlsx' ? 'Excel' : 'CSV'}
            </button>)}
          </div>
        </section>

        <aside data-testid="report-help" className="self-start rounded-2xl border border-slate-200 bg-slate-100/70 p-6 space-y-6 min-w-0">
          <h2 data-testid="report-help-heading" className="font-serif text-base md:text-lg font-bold text-slate-900">One event. A complete picture.</h2>
          <div><h3 data-testid="report-excel-label" className="text-sm font-semibold text-slate-800">Excel workbook</h3><p data-testid="report-excel-description" className="text-sm text-slate-600 mt-2 leading-relaxed">Two sheets: event summary and certificate details, with readable columns and custom metadata.</p></div>
          <div><h3 data-testid="report-csv-label" className="text-sm font-semibold text-slate-800">CSV spreadsheet</h3><p data-testid="report-csv-description" className="text-sm text-slate-600 mt-2 leading-relaxed">A clean certificate table for Excel, Google Sheets, or your next analysis.</p></div>
          <p data-testid="report-privacy-note" className="flex items-start gap-2 text-xs text-slate-600 pt-5 border-t border-slate-200 leading-relaxed"><ShieldCheck aria-hidden="true" className="w-4 h-4 shrink-0 text-brand-700" />Only certificates linked to the selected event are included. Reports contain personal data—share with care.</p>
          <p data-testid="report-legacy-note" className="text-xs text-slate-500 leading-relaxed">Older events without an organization must be assigned by your data administrator before they can appear here.</p>
        </aside>
      </div>
    </div>
  );
}