// Sessions panel — list active sessions, revoke individually.

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Monitor, X, Trash2, Clock, MapPin, CheckCircle2 } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

export default function SessionsPanel({ onClose }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/auth/sessions`);
      setSessions(res.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const revoke = async (id) => {
    if (!window.confirm('Sign out this session?')) return;
    await axios.delete(`${API}/auth/sessions/${id}`);
    load();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm grid place-items-center p-4">
      <div data-testid="sessions-modal" className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 text-white rounded-xl"><Monitor className="w-5 h-5" /></div>
            <div>
              <h3 className="text-xl font-bold font-serif text-slate-900">Active Sessions</h3>
              <p className="text-xs text-slate-500 mt-0.5">Devices signed into your account. Revoke any that look unfamiliar.</p>
            </div>
          </div>
          <button data-testid="close-sessions" onClick={onClose} className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && <div className="text-center py-8 text-slate-400 text-sm">Loading…</div>}
          {!loading && sessions.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">No sessions found</div>}
          {sessions.map((s) => (
            <div key={s.id} className={`p-4 rounded-xl border ${
              s.revoked_at ? 'bg-slate-50 border-slate-200 opacity-60' :
              s.current ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
            } flex justify-between items-start gap-3`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-slate-500">{s.id.slice(0, 8)}…</span>
                  {s.current && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> This device</span>}
                  {s.revoked_at && <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">Revoked</span>}
                  {s.revoke_reason && <span className="text-[10px] text-slate-500 italic">({s.revoke_reason})</span>}
                </div>
                <p className="text-sm text-slate-700 mt-1 truncate" title={s.user_agent}>{shortUA(s.user_agent)}</p>
                <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-2">
                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {s.ip || 'unknown'}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Created {new Date(s.created_at).toLocaleString()}</span>
                </div>
              </div>
              {!s.revoked_at && !s.current && (
                <button
                  data-testid={`revoke-session-${s.id}`}
                  onClick={() => revoke(s.id)}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg"
                  title="Revoke"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function shortUA(ua) {
  if (!ua) return 'Unknown device';
  const s = String(ua);
  if (s.includes('Chrome/')) return 'Chrome · ' + (s.match(/\(([^)]+)\)/)?.[1] || '');
  if (s.includes('Firefox/')) return 'Firefox · ' + (s.match(/\(([^)]+)\)/)?.[1] || '');
  if (s.includes('Safari/')) return 'Safari · ' + (s.match(/\(([^)]+)\)/)?.[1] || '');
  if (s.includes('curl/')) return 'curl (script)';
  return s.slice(0, 80);
}
