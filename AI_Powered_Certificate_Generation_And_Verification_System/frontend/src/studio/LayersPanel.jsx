import React, { useEffect, useRef, useState } from 'react';
import {
  Layers, Eye, EyeOff, Lock, Unlock, ChevronsUp, ChevronsDown, ArrowUp, ArrowDown, Pencil
} from 'lucide-react';
import { FIELD_TYPE_MAP, fieldSampleText, isTextField } from './constants';
import { Section, Label, IconButton, EmptyHint } from './ui';

const ORDER_BUTTONS = [
  { action: 'front', icon: ChevronsUp, title: 'Bring to front' },
  { action: 'forward', icon: ArrowUp, title: 'Bring forward (])' },
  { action: 'backward', icon: ArrowDown, title: 'Send backward ([)' },
  { action: 'back', icon: ChevronsDown, title: 'Send to back' }
];

function RowName({ field, template, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(field.label || '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== field.label) onRename(next);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setDraft(field.label || ''); setEditing(false); }
        }}
        onClick={(e) => e.stopPropagation()}
        className="w-full min-w-0 px-1 py-0.5 text-[11px] font-semibold border border-brand-600 rounded outline-none"
      />
    );
  }

  const preview = isTextField(field) ? fieldSampleText(field, template) : FIELD_TYPE_MAP[field.type]?.label;

  return (
    <span
      className="min-w-0 flex-1"
      onDoubleClick={(e) => {
        e.stopPropagation();
        setDraft(field.label || '');
        setEditing(true);
      }}
      title="Double-click to rename"
    >
      <span className="block text-[11px] font-semibold text-slate-800 truncate">
        {field.label || FIELD_TYPE_MAP[field.type]?.label || field.type}
      </span>
      <span className="block text-[9px] text-slate-400 truncate">{preview || field.type}</span>
    </span>
  );
}

export default function LayersPanel({
  fields,
  template,
  selectedIds,
  onSelect,
  onReorder,
  updateField
}) {
  const selected = new Set(selectedIds);
  // The array paints back-to-front, so the list shows the last entry at the top.
  const rows = [...fields].reverse();

  return (
    <Section icon={Layers} title="Layers" testId="ds-section-layers" badge={fields.length}>
      {fields.length === 0 ? (
        <EmptyHint title="No fields yet" subtitle="Add one from the palette or apply a starter layout." />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1">
            {ORDER_BUTTONS.map((b) => (
              <IconButton
                key={b.action}
                icon={b.icon}
                title={b.title}
                testId={`ds-layer-${b.action}`}
                disabled={!selectedIds.length}
                onClick={() => onReorder(b.action)}
              />
            ))}
          </div>

          <Label>Front to back</Label>
          <div
            data-testid="ds-layers-list"
            className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1"
          >
            {rows.map((f) => {
              const Icon = FIELD_TYPE_MAP[f.type]?.icon || Pencil;
              const active = selected.has(f.id);
              return (
                <div
                  key={f.id}
                  data-testid={`ds-layer-row-${f.id}`}
                  onClick={(e) => {
                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                      onSelect(active ? selectedIds.filter((id) => id !== f.id) : [...selectedIds, f.id]);
                    } else {
                      onSelect([f.id]);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border cursor-pointer transition ${
                    active
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  } ${f.visible === false ? 'opacity-60' : ''}`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 text-brand-600" />
                  <RowName
                    field={f}
                    template={template}
                    onRename={(label) => updateField(f.id, { label })}
                  />
                  <button
                    type="button"
                    title={f.visible === false ? 'Show field' : 'Hide field'}
                    data-testid={`ds-layer-visible-${f.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateField(f.id, { visible: f.visible === false });
                    }}
                    className="p-1 rounded text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                  >
                    {f.visible === false ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    title={f.locked ? 'Unlock field' : 'Lock field'}
                    data-testid={`ds-layer-lock-${f.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateField(f.id, { locked: !f.locked });
                    }}
                    className={`p-1 rounded hover:bg-slate-100 ${f.locked ? 'text-amber-600' : 'text-slate-400 hover:text-slate-800'}`}
                  >
                    {f.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400">
            Order here is paint order in the PDF. Shift-click to select several.
          </p>
        </>
      )}
    </Section>
  );
}
