import React from 'react';
import {
  Type, Move, Palette, Sparkles, Layers, Copy, Trash2, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, AlignCenterHorizontal, ArrowUpToLine,
  ArrowDownToLine, AlignHorizontalSpaceAround, AlignVerticalSpaceAround,
  ChevronsUp, ChevronsDown, ArrowUp, ArrowDown, Eye, EyeOff, Lock, Unlock,
  Upload, MousePointerClick, Minus
} from 'lucide-react';
import {
  FONT_FAMILIES, FIELD_TYPE_MAP, isTextField, isImageField, num, clamp
} from './constants';
import {
  Section, Label, TextInput, TextArea, Select, NumberInput, Slider, Swatch,
  ToggleButton, IconButton, Segmented, EmptyHint
} from './ui';

const MAX_IMAGE_BYTES = 1024 * 1024;

const ALIGN_BUTTONS = [
  { mode: 'left', icon: AlignLeft, title: 'Align left' },
  { mode: 'centerX', icon: AlignCenter, title: 'Align horizontal centres' },
  { mode: 'right', icon: AlignRight, title: 'Align right' },
  { mode: 'top', icon: ArrowUpToLine, title: 'Align top' },
  { mode: 'middleY', icon: AlignCenterHorizontal, title: 'Align vertical centres' },
  { mode: 'bottom', icon: ArrowDownToLine, title: 'Align bottom' }
];

const ORDER_BUTTONS = [
  { action: 'front', icon: ChevronsUp, title: 'Bring to front' },
  { action: 'forward', icon: ArrowUp, title: 'Bring forward (])' },
  { action: 'backward', icon: ArrowDown, title: 'Send backward ([)' },
  { action: 'back', icon: ChevronsDown, title: 'Send to back' }
];

function ArrangeControls({ onAlign, onDistribute, onReorder, canDistribute, alignHint }) {
  return (
    <>
      <div>
        <Label>{alignHint}</Label>
        <div className="grid grid-cols-6 gap-1">
          {ALIGN_BUTTONS.map((b) => (
            <IconButton
              key={b.mode}
              icon={b.icon}
              title={b.title}
              testId={`ds-align-${b.mode}`}
              onClick={() => onAlign(b.mode)}
            />
          ))}
        </div>
      </div>
      <div>
        <Label>Distribute</Label>
        <div className="grid grid-cols-2 gap-1">
          <IconButton
            icon={AlignHorizontalSpaceAround}
            title="Distribute horizontally (needs 3+ fields)"
            testId="ds-distribute-x"
            disabled={!canDistribute}
            onClick={() => onDistribute('x')}
          />
          <IconButton
            icon={AlignVerticalSpaceAround}
            title="Distribute vertically (needs 3+ fields)"
            testId="ds-distribute-y"
            disabled={!canDistribute}
            onClick={() => onDistribute('y')}
          />
        </div>
      </div>
      <div>
        <Label>Layer order</Label>
        <div className="grid grid-cols-4 gap-1">
          {ORDER_BUTTONS.map((b) => (
            <IconButton
              key={b.action}
              icon={b.icon}
              title={b.title}
              testId={`ds-order-${b.action}`}
              onClick={() => onReorder(b.action)}
            />
          ))}
        </div>
      </div>
    </>
  );
}

export default function Inspector({
  template,
  selectedFields,
  updateField,
  updateSelected,
  onDuplicate,
  onRemove,
  onReorder,
  onAlign,
  onDistribute,
  notify
}) {
  const count = selectedFields.length;

  if (!count) {
    return (
      <div data-testid="ds-inspector" className="space-y-3">
        <EmptyHint
          icon={MousePointerClick}
          title="Nothing selected"
          subtitle="Click a field on the canvas, drag a box around several, or add one from the left."
        />
      </div>
    );
  }

  /* ------------------------------------------------------------------ multi */
  if (count > 1) {
    const bulk = (patch) => updateSelected(patch);
    return (
      <div data-testid="ds-inspector" className="space-y-3">
        <Section icon={Layers} title={`${count} fields selected`} testId="ds-section-multi" badge={count}>
          <ArrangeControls
            onAlign={onAlign}
            onDistribute={onDistribute}
            onReorder={onReorder}
            canDistribute={count >= 3}
            alignHint="Align within selection"
          />

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <Label>Apply to all selected</Label>
            <div>
              <Label>Colour</Label>
              <Swatch testId="ds-bulk-color" value="#111827" onChange={(v) => bulk({ color: v })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Font</Label>
                <Select
                  testId="ds-bulk-font"
                  value=""
                  onChange={(e) => e.target.value && bulk({ fontFamily: e.target.value })}
                  options={[{ value: '', label: 'Keep current' }, ...FONT_FAMILIES]}
                />
              </div>
              <div>
                <Label>Alignment</Label>
                <Select
                  testId="ds-bulk-align"
                  value=""
                  onChange={(e) => e.target.value && bulk({ textAlign: e.target.value })}
                  options={[
                    { value: '', label: 'Keep current' },
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' }
                  ]}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <ToggleButton testId="ds-bulk-show" active={false} onClick={() => bulk({ visible: true })} title="Show all">
                <Eye className="w-4 h-4" /> Show
              </ToggleButton>
              <ToggleButton testId="ds-bulk-hide" active={false} onClick={() => bulk({ visible: false })} title="Hide all">
                <EyeOff className="w-4 h-4" /> Hide
              </ToggleButton>
              <ToggleButton testId="ds-bulk-unlock" active={false} onClick={() => bulk({ locked: false })} title="Unlock all">
                <Unlock className="w-4 h-4" /> Unlock
              </ToggleButton>
              <ToggleButton testId="ds-bulk-lock" active={false} onClick={() => bulk({ locked: true })} title="Lock all">
                <Lock className="w-4 h-4" /> Lock
              </ToggleButton>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              data-testid="ds-field-duplicate"
              onClick={onDuplicate}
              title="Duplicate selection (Ctrl+D)"
              className="py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 flex items-center justify-center gap-1.5 transition"
            >
              <Copy className="w-4 h-4" /> Duplicate
            </button>
            <button
              type="button"
              data-testid="ds-field-delete"
              onClick={onRemove}
              title="Delete selection (Del)"
              className="py-2 rounded-lg bg-rose-50 text-rose-700 text-sm font-semibold hover:bg-rose-100 flex items-center justify-center gap-1.5 transition"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        </Section>
      </div>
    );
  }

  /* ----------------------------------------------------------------- single */
  const field = selectedFields[0];
  const def = FIELD_TYPE_MAP[field.type];
  const TypeIcon = def?.icon || Type;
  const text = isTextField(field);
  const image = isImageField(field);
  const isBlock = field.type === 'text_block';
  const isQr = field.type === 'certificate_qr';
  const isDivider = field.type === 'divider';
  const editableText = field.type === 'custom_text' || isBlock;

  const put = (patch, key) => updateField(field.id, patch, key);

  const readImage = (file) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      notify?.('Signature and logo images must be under 1 MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => put({ image: reader.result });
    reader.readAsDataURL(file);
  };

  return (
    <div data-testid="ds-inspector" className="space-y-3">
      {/* ---------------- Content ---------------- */}
      <Section icon={TypeIcon} title={def?.label || 'Field'} testId="ds-section-content">
        <div>
          <Label>Label (studio only)</Label>
          <TextInput
            testId="ds-field-label"
            value={field.label || ''}
            onChange={(e) => put({ label: e.target.value }, `${field.id}:label`)}
          />
        </div>

        {editableText ? (
          isBlock ? (
            <div>
              <Label>Paragraph text</Label>
              <TextArea
                testId="ds-field-text"
                rows={4}
                value={field.text || ''}
                onChange={(e) => put({ text: e.target.value }, `${field.id}:text`)}
                placeholder="Wraps automatically inside the field width."
              />
            </div>
          ) : (
            <div>
              <Label>Text</Label>
              <TextInput
                testId="ds-field-text"
                value={field.text || ''}
                onChange={(e) => put({ text: e.target.value }, `${field.id}:text`)}
                placeholder="Static text"
              />
            </div>
          )
        ) : (
          <p className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-2.5 py-2">
            {image
              ? 'Upload the artwork below — it is stored inside the template.'
              : isQr
                ? 'The real QR code is generated per certificate; the canvas shows a placeholder.'
                : isDivider
                  ? 'A plain rule — set its length under Position & Size.'
                  : `Filled automatically from each certificate’s ${def?.label?.toLowerCase() || 'data'}.`}
          </p>
        )}

        {image && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer px-3 py-2 rounded-lg border border-dashed border-slate-300 text-xs font-semibold text-slate-600 hover:border-brand-600 hover:text-brand-700 flex items-center justify-center gap-1.5 transition">
                <Upload className="w-3.5 h-3.5" />
                {field.image ? 'Replace artwork' : 'Upload artwork'}
                <input
                  type="file"
                  accept="image/*"
                  data-testid="ds-field-image-input"
                  className="hidden"
                  onChange={(e) => {
                    readImage(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              {field.image && (
                <IconButton
                  icon={Trash2}
                  tone="danger"
                  title="Remove artwork"
                  testId="ds-field-image-clear"
                  onClick={() => put({ image: '' })}
                />
              )}
            </div>
            <p className="text-[10px] text-slate-400">
              PNG with transparency works best. Up to 1 MB; scaled to fit the box.
            </p>
          </div>
        )}

        {isDivider && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Line colour</Label>
              <Swatch
                testId="ds-field-line-color"
                value={field.lineColor || '#94a3b8'}
                onChange={(v) => put({ lineColor: v }, `${field.id}:lineColor`)}
              />
            </div>
            <div>
              <Label>Thickness</Label>
              <NumberInput
                testId="ds-field-line-thickness"
                min={0.25}
                step={0.25}
                value={num(field.lineThickness, 1.5)}
                onChange={(v) => put({ lineThickness: Math.max(0.25, v) }, `${field.id}:lineThickness`)}
              />
            </div>
          </div>
        )}
      </Section>

      {/* ---------------- Position & size ---------------- */}
      <Section icon={Move} title="Position & Size" testId="ds-section-position">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>X</Label>
            <NumberInput
              testId="ds-field-x"
              value={num(field.x)}
              onChange={(v) => put({ x: Math.round(v) }, `${field.id}:x`)}
            />
          </div>
          <div>
            <Label>Y</Label>
            <NumberInput
              testId="ds-field-y"
              value={num(field.y)}
              onChange={(v) => put({ y: Math.round(v) }, `${field.id}:y`)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>{isDivider ? 'Length' : 'Width'}</Label>
            <NumberInput
              testId="ds-field-width"
              min={4}
              value={num(field.width, 240)}
              onChange={(v) => put(
                isQr ? { width: Math.max(16, v), height: Math.max(16, v) } : { width: Math.max(4, v) },
                `${field.id}:width`
              )}
            />
          </div>
          {(image || isQr) && (
            <div>
              <Label>Height</Label>
              <NumberInput
                testId="ds-field-height"
                min={8}
                disabled={isQr}
                value={num(field.height, 60)}
                onChange={(v) => put({ height: Math.max(8, v) }, `${field.id}:height`)}
              />
            </div>
          )}
        </div>

        {text && (
          <p className="text-[10px] text-slate-400">
            Width sets the alignment box: text is placed inside it using the alignment below.
          </p>
        )}
        {isQr && <p className="text-[10px] text-slate-400">QR codes stay square.</p>}

        <Slider
          label="Rotation"
          testId="ds-field-rotation"
          min={0}
          max={359}
          step={1}
          value={num(field.rotation, 0)}
          onChange={(v) => put({ rotation: v }, `${field.id}:rotation`)}
          format={(v) => `${v}°`}
        />
      </Section>

      {/* ---------------- Typography ---------------- */}
      {text && (
        <Section icon={Palette} title="Typography" testId="ds-section-typography">
          <div>
            <Label>Font</Label>
            <Select
              testId="ds-field-font"
              value={field.fontFamily || 'Helvetica'}
              onChange={(e) => put({ fontFamily: e.target.value }, `${field.id}:fontFamily`)}
              options={FONT_FAMILIES}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Size</Label>
              <NumberInput
                testId="ds-field-fontsize"
                min={4}
                max={200}
                value={num(field.fontSize, 16)}
                onChange={(v) => put({ fontSize: clamp(v, 4, 200) }, `${field.id}:fontSize`)}
              />
            </div>
            <div>
              <Label>Colour</Label>
              <Swatch
                testId="ds-field-color"
                value={field.color || '#111827'}
                onChange={(v) => put({ color: v }, `${field.id}:color`)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <ToggleButton
              testId="ds-field-bold"
              title="Bold"
              active={field.fontWeight === 'bold'}
              onClick={() => put({ fontWeight: field.fontWeight === 'bold' ? 'normal' : 'bold' })}
            >
              <Bold className="w-4 h-4" />
            </ToggleButton>
            <ToggleButton
              testId="ds-field-italic"
              title="Italic"
              active={field.fontStyle === 'italic'}
              onClick={() => put({ fontStyle: field.fontStyle === 'italic' ? 'normal' : 'italic' })}
            >
              <Italic className="w-4 h-4" />
            </ToggleButton>
            <ToggleButton
              testId="ds-field-underline"
              title="Underline"
              active={!!field.underline}
              onClick={() => put({ underline: !field.underline })}
            >
              <Underline className="w-4 h-4" />
            </ToggleButton>
          </div>

          <div>
            <Label>Alignment</Label>
            <Segmented
              testId="ds-field-textalign"
              value={field.textAlign || 'left'}
              onChange={(v) => put({ textAlign: v }, `${field.id}:textAlign`)}
              options={[
                { value: 'left', label: '', title: 'Left', icon: AlignLeft },
                { value: 'center', label: '', title: 'Center', icon: AlignCenter },
                { value: 'right', label: '', title: 'Right', icon: AlignRight }
              ]}
            />
          </div>

          <div>
            <Label>Case</Label>
            <Select
              testId="ds-field-transform"
              value={field.textTransform || 'none'}
              onChange={(e) => put({ textTransform: e.target.value }, `${field.id}:textTransform`)}
              options={[
                { value: 'none', label: 'As entered' },
                { value: 'uppercase', label: 'UPPERCASE' },
                { value: 'lowercase', label: 'lowercase' },
                { value: 'capitalize', label: 'Capitalise Words' }
              ]}
            />
          </div>

          <Slider
            label="Letter spacing"
            testId="ds-field-letterspacing"
            min={-2}
            max={20}
            step={0.5}
            value={num(field.letterSpacing, 0)}
            onChange={(v) => put({ letterSpacing: v }, `${field.id}:letterSpacing`)}
            format={(v) => `${v} pt`}
          />

          {isBlock && (
            <Slider
              label="Line height"
              testId="ds-field-lineheight"
              min={1}
              max={2.5}
              step={0.05}
              value={num(field.lineHeight, 1.35)}
              onChange={(v) => put({ lineHeight: v }, `${field.id}:lineHeight`)}
              format={(v) => `${v.toFixed(2)}×`}
            />
          )}
        </Section>
      )}

      {/* ---------------- Effects ---------------- */}
      <Section icon={Sparkles} title="Effects & State" testId="ds-section-effects" defaultOpen={false}>
        <Slider
          label="Opacity"
          testId="ds-field-opacity"
          min={0.05}
          max={1}
          step={0.05}
          value={clamp(num(field.opacity, 1), 0.05, 1)}
          onChange={(v) => put({ opacity: v }, `${field.id}:opacity`)}
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <div className="grid grid-cols-2 gap-1">
          <ToggleButton
            testId="ds-field-visible"
            title="Hidden fields are skipped in the PDF"
            active={field.visible !== false}
            onClick={() => put({ visible: field.visible === false })}
          >
            {field.visible === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {field.visible === false ? 'Hidden' : 'Visible'}
          </ToggleButton>
          <ToggleButton
            testId="ds-field-locked"
            title="Locked fields ignore canvas drags"
            active={!!field.locked}
            onClick={() => put({ locked: !field.locked })}
          >
            {field.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            {field.locked ? 'Locked' : 'Unlocked'}
          </ToggleButton>
        </div>
        {field.visible === false && (
          <p className="text-[10px] text-rose-500 flex items-center gap-1">
            <Minus className="w-3 h-3" /> This field will not appear in generated PDFs.
          </p>
        )}
      </Section>

      {/* ---------------- Arrange ---------------- */}
      <Section icon={Layers} title="Arrange" testId="ds-section-arrange" defaultOpen={false}>
        <ArrangeControls
          onAlign={onAlign}
          onDistribute={onDistribute}
          onReorder={onReorder}
          canDistribute={false}
          alignHint="Align to page"
        />
      </Section>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="ds-field-duplicate"
          onClick={onDuplicate}
          title="Duplicate (Ctrl+D)"
          className="py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 flex items-center justify-center gap-1.5 transition"
        >
          <Copy className="w-4 h-4" /> Duplicate
        </button>
        <button
          type="button"
          data-testid="ds-field-delete"
          onClick={onRemove}
          title="Delete (Del)"
          className="py-2.5 rounded-xl bg-rose-50 text-rose-700 text-sm font-semibold hover:bg-rose-100 flex items-center justify-center gap-1.5 transition"
        >
          <Trash2 className="w-4 h-4" /> Delete
        </button>
      </div>
    </div>
  );
}
