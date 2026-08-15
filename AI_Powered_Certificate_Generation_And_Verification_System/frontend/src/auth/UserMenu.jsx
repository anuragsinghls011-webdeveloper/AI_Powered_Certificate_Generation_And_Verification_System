// User menu dropdown for the header — profile, sessions, org switcher, logout.

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { User, LogOut, Shield, Monitor, Building2, ChevronDown, Mail, CheckCircle2 } from 'lucide-react';
import SessionsPanel from './SessionsPanel';

export default function UserMenu() {
  const { user, membership, memberships, organization, logout, logoutAll, switchOrg } = useAuth();
  const [open, setOpen] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (!user) return null;
  const initials = (user.name || user.email).split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          data-testid="user-menu-trigger"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm border border-slate-700 transition"
        >
          <span className="w-7 h-7 rounded-full bg-brand-600 grid place-items-center font-bold text-xs">{initials}</span>
          <span className="hidden sm:inline text-xs font-semibold">{user.name || user.email}</span>
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
        {open && (
          <div data-testid="user-menu-dropdown" className="absolute right-0 top-full mt-2 w-72 bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
            <div className="p-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-600 text-white grid place-items-center font-bold">{initials}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{user.name || user.email}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              {membership && (
                <div className="mt-3 flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-500">Role</span>
                  <span data-testid="user-role-badge" className="text-xs font-mono font-bold bg-brand-100 text-brand-700 px-2 py-0.5 rounded uppercase">{membership.role}</span>
                </div>
              )}
              {!user.email_verified && (
                <div className="mt-2 p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Email not verified
                </div>
              )}
            </div>
            {memberships && memberships.length > 1 && (
              <div className="p-2 border-b border-slate-100">
                <p className="text-[10px] font-bold uppercase text-slate-400 px-2 py-1">Switch organization</p>
                {memberships.map((m) => (
                  <button
                    key={m.organization_id}
                    data-testid={`switch-org-${m.organization_id}`}
                    onClick={async () => { await switchOrg(m.organization_id); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-slate-50 flex items-center gap-2 ${
                      m.organization_id === organization?.id ? 'bg-brand-50 text-brand-700' : ''
                    }`}
                  >
                    <Building2 className="w-4 h-4" />
                    <span className="flex-1 truncate">{m.organization?.name || m.organization_id}</span>
                    {m.organization_id === organization?.id && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </button>
                ))}
              </div>
            )}
            <div className="p-1">
              <MenuItem testid="menu-sessions" icon={Monitor} onClick={() => { setOpen(false); setShowSessions(true); }}>Active sessions</MenuItem>
              <MenuItem testid="menu-logout" icon={LogOut} onClick={logout}>Sign out</MenuItem>
              <MenuItem testid="menu-logout-all" icon={Shield} danger onClick={logoutAll}>Sign out all devices</MenuItem>
            </div>
          </div>
        )}
      </div>
      {showSessions && <SessionsPanel onClose={() => setShowSessions(false)} />}
    </>
  );
}

function MenuItem({ icon: Icon, children, danger, onClick, testid }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition ${
        danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="w-4 h-4" /> {children}
    </button>
  );
}
