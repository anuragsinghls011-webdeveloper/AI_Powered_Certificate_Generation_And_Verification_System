import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function Notification({ notification }) {
  if (!notification.message) return null;

  return (
    <div data-testid="notification-banner" className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-medium flex items-center gap-3 transition-all ${
      notification.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
    }`}>
      {notification.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
      <span>{notification.message}</span>
    </div>
  );
}
