import { useEffect, useRef, useState } from 'react';
import { loadReportEvents, loadEventSummary, downloadEventReport, reportError } from '../services/eventReports';

export default function useEventReports(organizationId) {
  const [events, setEvents] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [summary, setSummary] = useState(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [generating, setGenerating] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retry, setRetry] = useState(0);
  const downloadRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingEvents(true); setError(''); setEvents([]); setSelectedId(''); setSummary(null);
    loadReportEvents(organizationId, controller.signal)
      .then(res => { if (!controller.signal.aborted) setEvents(res.data.events); })
      .catch(async err => { const message = await reportError(err); if (!controller.signal.aborted) setError(message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingEvents(false); });
    return () => controller.abort();
  }, [organizationId, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setSummary(null); setSuccess('');
    if (!selectedId) { setLoadingSummary(false); return () => controller.abort(); }
    setLoadingSummary(true); setError('');
    loadEventSummary(selectedId, organizationId, controller.signal)
      .then(res => { if (!controller.signal.aborted) setSummary(res.data); })
      .catch(async err => { const message = await reportError(err); if (!controller.signal.aborted) setError(message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingSummary(false); });
    return () => controller.abort();
  }, [selectedId, organizationId]);

  useEffect(() => () => downloadRef.current?.abort(), []);

  const generate = async format => {
    if (downloadRef.current || !summary?.total || summary.event.id !== selectedId) return;
    const controller = new AbortController();
    downloadRef.current = controller;
    setGenerating(format); setError(''); setSuccess('');
    try {
      await downloadEventReport(selectedId, format, organizationId, controller.signal);
      if (!controller.signal.aborted) setSuccess('Report generated successfully. Your download has started.');
    } catch (err) {
      const message = await reportError(err);
      if (!controller.signal.aborted) setError(message);
    } finally {
      downloadRef.current = null;
      if (!controller.signal.aborted) setGenerating('');
    }
  };

  return { events, selectedId, setSelectedId, summary, loadingEvents, loadingSummary, generating,
    error, success, generate, reload: () => setRetry(value => value + 1) };
}