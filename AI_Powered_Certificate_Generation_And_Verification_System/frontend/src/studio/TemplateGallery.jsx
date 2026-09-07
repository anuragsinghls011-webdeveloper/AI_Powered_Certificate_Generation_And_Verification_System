import React, { useMemo, useState } from 'react';
import { LayoutTemplate, Search, FilePlus2, Copy, Trash2, FolderOpen, Tag } from 'lucide-react';
import { PAGE_W, normalizeTemplate } from './constants';
import CertificateSurface from './CertificateSurface';
import { Modal, TextInput, Select, EmptyHint } from './ui';

const CARD_W = 252;
const CARD_SCALE = CARD_W / PAGE_W;

export default function TemplateGallery({
  open,
  onClose,
  templates,
  currentId,
  onOpenTemplate,
  onDuplicate,
  onDelete,
  onNew
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const prepared = useMemo(() => templates.map((t) => normalizeTemplate(t)), [templates]);

  const categories = useMemo(() => {
    const set = new Set();
    for (const t of prepared) if (t.category) set.add(t.category);
    return Array.from(set).sort();
  }, [prepared]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return prepared.filter((t) => {
      if (category && t.category !== category) return false;
      if (!q) return true;
      const haystack = [t.name, t.description, t.category, ...(t.tags || [])].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [prepared, query, category]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={LayoutTemplate}
      title="Template Gallery"
      subtitle={`${templates.length} saved template${templates.length === 1 ? '' : 's'}`}
      testId="ds-gallery"
    >
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="relative flex-1 min-w-[14rem]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <TextInput
            testId="ds-gallery-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, description or tag…"
            style={{ paddingLeft: '2.25rem' }}
          />
        </div>
        <div className="w-44">
          <Select
            testId="ds-gallery-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[{ value: '', label: 'All categories' }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        </div>
        <button
          type="button"
          data-testid="ds-gallery-new"
          onClick={() => { onNew(); onClose(); }}
          className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-bold flex items-center gap-1.5 hover:bg-brand-700 transition"
        >
          <FilePlus2 className="w-4 h-4" />
          Blank template
        </button>
      </div>

      {visible.length === 0 ? (
        <EmptyHint
          icon={FolderOpen}
          title={templates.length ? 'No template matches that search' : 'No templates saved yet'}
          subtitle={templates.length ? 'Try a different name, tag or category.' : 'Start from a blank template or a starter layout.'}
        />
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_W}px, 1fr))` }}>
          {visible.map((t) => (
            <div
              key={t.id}
              data-testid={`ds-gallery-card-${t.id}`}
              className={`bg-white rounded-xl border overflow-hidden shadow-sm transition ${
                t.id === currentId ? 'border-brand-600 ring-2 ring-brand-600/20' : 'border-slate-200 hover:border-brand-400'
              }`}
            >
              <button
                type="button"
                onClick={() => { onOpenTemplate(t); onClose(); }}
                title={`Open ${t.name}`}
                className="block w-full bg-slate-100 border-b border-slate-200 overflow-hidden"
                style={{ height: Math.round(612 * CARD_SCALE) }}
              >
                <div className="pointer-events-none">
                  <CertificateSurface template={t} scale={CARD_SCALE} />
                </div>
              </button>

              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{t.name}</p>
                    <p className="text-[10px] text-slate-500">
                      {t.category || 'General'} · {t.fields.length} field{t.fields.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  {t.id === currentId && (
                    <span className="text-[9px] font-bold uppercase bg-brand-50 text-brand-700 px-1.5 py-0.5 rounded">
                      Open
                    </span>
                  )}
                </div>

                {t.description && (
                  <p
                    className="text-[11px] text-slate-500 mt-1.5 overflow-hidden"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                  >
                    {t.description}
                  </p>
                )}

                {!!(t.tags || []).length && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {t.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded flex items-center gap-0.5"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-1.5 mt-3">
                  <button
                    type="button"
                    data-testid={`ds-gallery-open-${t.id}`}
                    onClick={() => { onOpenTemplate(t); onClose(); }}
                    className="flex-1 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800 transition"
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    title="Duplicate"
                    data-testid={`ds-gallery-duplicate-${t.id}`}
                    onClick={() => onDuplicate(t)}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:border-brand-600 hover:text-brand-700 transition"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    data-testid={`ds-gallery-delete-${t.id}`}
                    onClick={() => onDelete(t)}
                    className="p-1.5 rounded-lg border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
