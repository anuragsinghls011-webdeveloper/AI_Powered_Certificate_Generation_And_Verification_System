import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Collapsible panel section. */
export function Section({ icon: Icon, title, children, defaultOpen = true, testId, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50 transition"
      >
        <span className="flex items-center gap-2 font-bold text-sm text-slate-900">
          {Icon && <Icon className="w-4 h-4 text-brand-600" />}
          {title}
        </span>
        <span className="flex items-center gap-2">
          {badge != null && (
            <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{badge}</span>
          )}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition ${open ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

export function Label({ children, icon: Icon }) {
  return (
    <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600/20';

export function TextInput({ testId, ...props }) {
  return <input type="text" data-testid={testId} className={inputClass} {...props} />;
}

export function TextArea({ testId, rows = 3, ...props }) {
  return <textarea data-testid={testId} rows={rows} className={inputClass} {...props} />;
}

export function Select({ testId, options, value, onChange, ...props }) {
  return (
    <select
      data-testid={testId}
      value={value}
      onChange={onChange}
      className={`${inputClass} bg-white`}
      {...props}
    >
      {options.map((o) =>
        typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
      )}
    </select>
  );
}

export function NumberInput({ testId, value, onChange, step = 1, ...props }) {
  return (
    <input
      type="number"
      data-testid={testId}
      value={Number.isFinite(value) ? value : 0}
      step={step}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === '' || raw === '-' ? 0 : parseFloat(raw));
      }}
      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-brand-600"
      {...props}
    />
  );
}

export function Slider({ label, value, onChange, min = 0, max = 100, step = 1, testId, format }) {
  return (
    <div>
      {label && (
        <Label>
          {label}
          <span className="ml-auto font-mono text-slate-500 normal-case">
            {format ? format(value) : value}
          </span>
        </Label>
      )}
      <input
        type="range"
        data-testid={testId}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-brand-600"
      />
    </div>
  );
}

export function Swatch({ value, onChange, testId, title }) {
  return (
    <input
      type="color"
      data-testid={testId}
      title={title}
      value={value || '#000000'}
      onChange={(e) => onChange(e.target.value)}
      className="w-full h-9 rounded-lg border border-slate-200 cursor-pointer bg-white"
    />
  );
}

export function ToggleButton({ active, onClick, children, title, testId, className = '' }) {
  return (
    <button
      type="button"
      title={title}
      data-testid={testId}
      onClick={onClick}
      className={`py-2 px-2.5 rounded-lg border text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
        active
          ? 'bg-brand-600 text-white border-brand-600'
          : 'bg-white text-slate-700 border-slate-200 hover:border-brand-600'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/** Small icon-only button used across the toolbar and layer rows. */
export function IconButton({ icon: Icon, onClick, title, testId, active, disabled, tone = 'default' }) {
  const tones = {
    default: 'bg-white border-slate-200 text-slate-700 hover:border-brand-600 hover:text-brand-700',
    danger: 'bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100',
    ghost: 'bg-transparent border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100'
  };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className={`p-2 rounded-lg border transition disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? 'bg-brand-600 border-brand-600 text-white' : tones[tone]
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}

export function Segmented({ value, onChange, options, testId }) {
  return (
    <div data-testid={testId} className="flex bg-slate-100 rounded-lg p-1 gap-1">
      {options.map((o) => {
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title || o.label}
            onClick={() => onChange(o.value)}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition ${
              value === o.value ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyHint({ icon: Icon, title, subtitle }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-center text-slate-400">
      {Icon && <Icon className="w-8 h-8 mx-auto mb-2 opacity-40" />}
      <p className="text-sm font-medium">{title}</p>
      {subtitle && <p className="text-xs mt-1">{subtitle}</p>}
    </div>
  );
}

/** Full-screen modal shell. */
export function Modal({ open, onClose, title, subtitle, icon: Icon, children, footer, maxWidth = 'max-w-5xl', testId }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
        className={`bg-slate-50 rounded-2xl shadow-2xl w-full ${maxWidth} my-8 overflow-hidden border border-slate-200`}
      >
        <div className="bg-white px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="p-2 bg-brand-600 text-white rounded-xl"><Icon className="w-5 h-5" /></div>
            )}
            <div>
              <h3 className="font-bold font-serif text-slate-900">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
          >
            Close
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="bg-white px-5 py-3 border-t border-slate-200">{footer}</div>}
      </div>
    </div>
  );
}
