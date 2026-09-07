import React, { useEffect, useRef, useState } from 'react';
import {
  Plus, Wand2, Info, Palette, ImageIcon, Droplet, Trash2, Upload, Blend
} from 'lucide-react';
import {
  FIELD_TYPES, FIELD_GROUPS, STARTER_LAYOUTS, COLOR_PALETTES, BORDER_STYLES,
  BACKGROUND_FITS, CATEGORIES, num, clamp
} from './constants';
import { Section, Label, TextInput, TextArea, Select, Slider, Swatch, ToggleButton } from './ui';

const MAX_BG_BYTES = 4 * 1024 * 1024;

/** Comma-separated tag editor that keeps its own text while you type. */
function TagsInput({ value, onChange }) {
  const joined = (value || []).join(', ');
  const [text, setText] = useState(joined);
  const lastPushed = useRef(joined);

  useEffect(() => {
    if (joined !== lastPushed.current) {
      setText(joined);
      lastPushed.current = joined;
    }
  }, [joined]);

  return (
    <TextInput
      testId="ds-tags-input"
      value={text}
      placeholder="modern, blue, hackathon"
      onChange={(e) => {
        setText(e.target.value);
        const tags = e.target.value.split(',').map((t) => t.trim()).filter(Boolean);
        lastPushed.current = tags.join(', ');
        onChange(tags);
      }}
    />
  );
}

export default function LeftPanel({
  template,
  set,
  onAddField,
  onApplyStarter,
  notify
}) {
  const bgInputRef = useRef(null);

  const readBackground = (file) => {
    if (!file) return;
    if (file.size > MAX_BG_BYTES) {
      notify?.('Background image must be under 4 MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set('background_image', reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      {/* ---------------- Add field ---------------- */}
      <Section icon={Plus} title="Add Field" testId="ds-section-add-field" badge={FIELD_TYPES.length}>
        {FIELD_GROUPS.map((group) => {
          const items = FIELD_TYPES.filter((t) => t.group === group);
          if (!items.length) return null;
          return (
            <div key={group}>
              <Label>{group}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.type}
                      type="button"
                      data-testid={`ds-add-field-${t.type}`}
                      onClick={() => onAddField(t.type)}
                      title={`Add ${t.label}`}
                      className="flex items-center gap-1.5 px-2 py-2 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:border-brand-600 hover:text-brand-700 hover:bg-brand-50 transition text-left"
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 text-brand-600" />
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Section>

      {/* ---------------- Starter layouts ---------------- */}
      <Section icon={Wand2} title="Starter Layouts" testId="ds-section-starters" defaultOpen={false}>
        <p className="text-[11px] text-slate-500">
          Replaces the current colours and fields with a complete, ready-to-edit design.
        </p>
        {STARTER_LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            type="button"
            data-testid={`ds-starter-${layout.id}`}
            onClick={() => onApplyStarter(layout)}
            className="w-full text-left px-3 py-2.5 rounded-xl border border-slate-200 bg-white hover:border-brand-600 hover:bg-brand-50 transition"
          >
            <span className="flex items-center gap-2">
              <span className="flex gap-0.5">
                <span className="w-2.5 h-6 rounded-sm" style={{ background: layout.patch.primary_color }} />
                <span className="w-2.5 h-6 rounded-sm" style={{ background: layout.patch.secondary_color }} />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-900">{layout.name}</span>
                <span className="block text-[10px] text-slate-500 leading-snug">{layout.description}</span>
              </span>
            </span>
          </button>
        ))}
      </Section>

      {/* ---------------- Template info ---------------- */}
      <Section icon={Info} title="Template Info" testId="ds-section-info">
        <div>
          <Label>Name</Label>
          <TextInput
            testId="ds-name-input"
            value={template.name || ''}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Template name"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Category</Label>
            <Select
              testId="ds-category-select"
              value={template.category || 'General'}
              onChange={(e) => set('category', e.target.value)}
              options={CATEGORIES}
            />
          </div>
          <div>
            <Label>Style</Label>
            <Select
              testId="ds-style-select"
              value={template.style || 'modern'}
              onChange={(e) => set('style', e.target.value)}
              options={[
                { value: 'modern', label: 'Modern' },
                { value: 'classic', label: 'Classic' },
                { value: 'minimal', label: 'Minimal' }
              ]}
            />
          </div>
        </div>
        <div>
          <Label>Tags</Label>
          <TagsInput value={template.tags} onChange={(tags) => set('tags', tags)} />
        </div>
        <div>
          <Label>Description</Label>
          <TextArea
            testId="ds-description-input"
            rows={2}
            value={template.description || ''}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Where should this template be used?"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Issuer name</Label>
            <TextInput
              testId="ds-issuer-name"
              value={template.issuer_name || ''}
              onChange={(e) => set('issuer_name', e.target.value)}
            />
          </div>
          <div>
            <Label>Issuer title</Label>
            <TextInput
              testId="ds-issuer-title"
              value={template.issuer_title || ''}
              onChange={(e) => set('issuer_title', e.target.value)}
            />
          </div>
        </div>
        <p className="text-[10px] text-slate-400">
          Issuer values fill the signature fields when a certificate has none of its own.
        </p>
      </Section>

      {/* ---------------- Colours & border ---------------- */}
      <Section icon={Palette} title="Colours & Border" testId="ds-section-style">
        <div>
          <Label>Palette</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {COLOR_PALETTES.map((p) => {
              const active = template.primary_color === p.primary && template.secondary_color === p.secondary;
              return (
                <button
                  key={p.name}
                  type="button"
                  data-testid={`ds-palette-${p.name.toLowerCase()}`}
                  title={p.name}
                  onClick={() => {
                    set('primary_color', p.primary);
                    set('secondary_color', p.secondary);
                  }}
                  className={`rounded-lg border p-1 transition ${
                    active ? 'border-brand-600 ring-2 ring-brand-600/20' : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <span className="flex h-5 rounded overflow-hidden">
                    <span className="flex-1" style={{ background: p.primary }} />
                    <span className="w-1/3" style={{ background: p.secondary }} />
                  </span>
                  <span className="block text-[9px] font-semibold text-slate-500 mt-0.5">{p.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Primary</Label>
            <Swatch
              testId="ds-primary-color"
              value={template.primary_color}
              onChange={(v) => set('primary_color', v)}
            />
          </div>
          <div>
            <Label>Accent</Label>
            <Swatch
              testId="ds-secondary-color"
              value={template.secondary_color}
              onChange={(v) => set('secondary_color', v)}
            />
          </div>
        </div>

        <div>
          <Label>Border style</Label>
          <Select
            testId="ds-border-style"
            value={template.border_style || 'solid'}
            onChange={(e) => set('border_style', e.target.value)}
            options={BORDER_STYLES}
          />
        </div>

        <Slider
          label="Border width"
          testId="ds-border-width"
          min={0.5}
          max={14}
          step={0.5}
          value={num(template.border_width, 4)}
          onChange={(v) => set('border_width', v)}
          format={(v) => `${v} pt`}
        />

        <Slider
          label="Corner radius"
          testId="ds-corner-radius"
          min={0}
          max={40}
          step={1}
          value={num(template.corner_radius, 0)}
          onChange={(v) => set('corner_radius', v)}
          format={(v) => `${v} pt`}
        />

        <ToggleButton
          testId="ds-accent-ring"
          active={template.accent_ring !== false}
          onClick={() => set('accent_ring', template.accent_ring === false)}
          className="w-full"
          title="Draw a thin accent ring inside the border"
        >
          <Blend className="w-4 h-4" />
          Accent ring {template.accent_ring === false ? 'off' : 'on'}
        </ToggleButton>
      </Section>

      {/* ---------------- Background ---------------- */}
      <Section icon={ImageIcon} title="Background" testId="ds-section-background">
        <div>
          <Label>Page colour</Label>
          <Swatch
            testId="ds-background-color"
            value={template.background_color || '#ffffff'}
            onChange={(v) => set('background_color', v)}
          />
        </div>

        <ToggleButton
          testId="ds-gradient-toggle"
          active={!!template.gradient_enabled}
          onClick={() => set('gradient_enabled', !template.gradient_enabled)}
          className="w-full"
          title="Use a two-stop linear gradient instead of a flat colour"
        >
          <Droplet className="w-4 h-4" />
          Gradient {template.gradient_enabled ? 'on' : 'off'}
        </ToggleButton>

        {template.gradient_enabled && (
          <div className="space-y-2 pl-2 border-l-2 border-brand-100">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>From</Label>
                <Swatch
                  testId="ds-gradient-from"
                  value={template.gradient_from || '#ffffff'}
                  onChange={(v) => set('gradient_from', v)}
                />
              </div>
              <div>
                <Label>To</Label>
                <Swatch
                  testId="ds-gradient-to"
                  value={template.gradient_to || '#e2e8f0'}
                  onChange={(v) => set('gradient_to', v)}
                />
              </div>
            </div>
            <Slider
              label="Angle"
              testId="ds-gradient-angle"
              min={0}
              max={360}
              step={5}
              value={num(template.gradient_angle, 90)}
              onChange={(v) => set('gradient_angle', v)}
              format={(v) => `${v}°`}
            />
          </div>
        )}

        <div>
          <Label>Image</Label>
          <div className="flex gap-2">
            <label
              data-testid="ds-upload-bg-label"
              className="flex-1 cursor-pointer px-3 py-2 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-600 hover:border-brand-600 hover:text-brand-700 flex items-center justify-center gap-1.5 transition"
            >
              <Upload className="w-3.5 h-3.5" />
              {template.background_image ? 'Replace image' : 'Upload image'}
              <input
                ref={bgInputRef}
                data-testid="ds-upload-bg-input"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  readBackground(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            {template.background_image && (
              <button
                type="button"
                data-testid="ds-clear-bg"
                onClick={() => set('background_image', '')}
                title="Remove background image"
                className="px-2.5 rounded-lg border border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">PNG or JPG, up to 4 MB. Stored inside the template.</p>
        </div>

        {template.background_image && (
          <div className="space-y-2 pl-2 border-l-2 border-brand-100">
            <div>
              <Label>Fit</Label>
              <Select
                testId="ds-background-fit"
                value={template.background_fit || 'stretch'}
                onChange={(e) => set('background_fit', e.target.value)}
                options={BACKGROUND_FITS}
              />
            </div>
            <Slider
              label="Image opacity"
              testId="ds-background-opacity"
              min={0.05}
              max={1}
              step={0.05}
              value={clamp(num(template.background_opacity, 1), 0.05, 1)}
              onChange={(v) => set('background_opacity', v)}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
        )}

        <div className="pt-1 border-t border-slate-100">
          <Label>Watermark text</Label>
          <TextInput
            testId="ds-watermark-text"
            value={template.watermark_text || ''}
            onChange={(e) => set('watermark_text', e.target.value)}
            placeholder="e.g. VERIFIED"
          />
        </div>

        {!!(template.watermark_text || '').trim() && (
          <div className="space-y-2 pl-2 border-l-2 border-brand-100">
            <div>
              <Label>Watermark colour</Label>
              <Swatch
                testId="ds-watermark-color"
                value={template.watermark_color || '#94a3b8'}
                onChange={(v) => set('watermark_color', v)}
              />
            </div>
            <Slider
              label="Watermark size"
              testId="ds-watermark-size"
              min={24}
              max={180}
              step={2}
              value={num(template.watermark_size, 72)}
              onChange={(v) => set('watermark_size', v)}
              format={(v) => `${v} pt`}
            />
            <Slider
              label="Watermark opacity"
              testId="ds-watermark-opacity"
              min={0.02}
              max={0.5}
              step={0.01}
              value={clamp(num(template.watermark_opacity, 0.08), 0.02, 0.5)}
              onChange={(v) => set('watermark_opacity', v)}
              format={(v) => `${Math.round(v * 100)}%`}
            />
          </div>
        )}
      </Section>
    </div>
  );
}
