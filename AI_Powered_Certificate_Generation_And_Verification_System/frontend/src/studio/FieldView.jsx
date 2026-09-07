import React from 'react';
import { QrCode, Image as ImageIcon, PenTool } from 'lucide-react';
import {
  SCALE_Y, num, textLayout, fieldSampleText, applyTextTransform,
  isTextField, isImageField
} from './constants';

/**
 * One field, drawn the way the PDF will draw it.
 *
 * Geometry notes (these are what keep canvas and PDF in agreement):
 *  - x is the same in both spaces; y and font sizes scale by SCALE_Y.
 *  - text elements are shifted up by textLayout().topOffset so the CSS baseline
 *    lands where PDFKit puts it (PDFKit anchors text by its ascender).
 *  - PDFKit rotates around the field's raw origin (x, y·SCALE_Y), so the CSS
 *    transform-origin is moved back up by that same offset.
 */
export default function FieldView({
  field,
  template,
  selected = false,
  interactive = false,
  scale = 1,
  onPointerDown,
  onDoubleClick,
  registerNode
}) {
  const pageY = num(field.y) * SCALE_Y;
  const pageX = num(field.x);
  const rotation = num(field.rotation, 0);
  const opacity = field.visible === false ? 0 : num(field.opacity, 1);

  const text = isTextField(field)
    ? applyTextTransform(fieldSampleText(field, template), field.textTransform)
    : '';
  const isBlock = field.type === 'text_block';
  const layout = isTextField(field) ? textLayout(field, isBlock ? num(field.lineHeight, 1.35) : 1) : null;

  let topOffset = 0;
  let inner = null;
  const style = {
    position: 'absolute',
    left: pageX,
    opacity,
    color: field.color || '#111827'
  };

  if (layout) {
    topOffset = layout.topOffset;
    Object.assign(style, {
      fontFamily: layout.fontFamily,
      fontSize: `${layout.fontSize}px`,
      lineHeight: `${layout.lineHeightPx}px`,
      fontWeight: layout.fontWeight,
      fontStyle: layout.fontStyle,
      letterSpacing: `${num(field.letterSpacing, 0)}px`,
      textAlign: field.textAlign || 'left',
      textDecoration: field.underline ? 'underline' : 'none',
      whiteSpace: isBlock ? 'pre-wrap' : 'nowrap',
      width: field.width ? num(field.width) : undefined
    });
    inner = text || <span className="text-slate-300 italic">{field.label || 'Empty text'}</span>;
  } else if (field.type === 'certificate_qr') {
    // The renderer draws the QR square, sized from width only.
    const size = Math.max(16, num(field.width, 80));
    Object.assign(style, { width: size, height: size });
    inner = (
      <div className="w-full h-full bg-white border border-slate-800 grid place-items-center overflow-hidden">
        <div className="text-center leading-none">
          <QrCode className="mx-auto text-slate-900" style={{ width: size * 0.6, height: size * 0.6 }} />
          <div className="text-[8px] font-bold text-slate-600 mt-0.5">VERIFY</div>
        </div>
      </div>
    );
  } else if (isImageField(field)) {
    const w = Math.max(8, num(field.width, 160));
    const h = Math.max(8, num(field.height, 60)) * SCALE_Y;
    Object.assign(style, { width: w, height: h });
    const Placeholder = field.type === 'signature_image' ? PenTool : ImageIcon;
    inner = field.image ? (
      // PDFKit uses fit + centre alignment, i.e. object-fit: contain.
      <img
        src={field.image}
        alt={field.label || field.type}
        className="w-full h-full"
        style={{ objectFit: 'contain', objectPosition: 'center' }}
        draggable={false}
      />
    ) : (
      <div className="w-full h-full border-2 border-dashed border-slate-300 rounded grid place-items-center bg-white/50">
        <div className="text-center text-slate-400">
          <Placeholder className="w-4 h-4 mx-auto" />
          <div className="text-[8px] font-semibold mt-0.5">
            {field.type === 'signature_image' ? 'Signature' : 'Logo'}
          </div>
        </div>
      </div>
    );
  } else if (field.type === 'divider') {
    const thickness = Math.max(0.25, num(field.lineThickness, 1.5));
    // The PDF strokes a line centred on y, so the div straddles it too.
    topOffset = -thickness / 2;
    Object.assign(style, {
      width: Math.max(4, num(field.width, 220)),
      height: thickness,
      background: field.lineColor || field.color || '#94a3b8'
    });
  }

  style.top = pageY + topOffset;
  style.transform = rotation ? `rotate(${rotation}deg)` : undefined;
  style.transformOrigin = `0px ${-topOffset}px`;

  const cursor = interactive ? (field.locked ? 'not-allowed' : 'move') : 'default';
  const outline = selected ? '1.5px solid rgb(37 99 235)' : undefined;

  return (
    <div
      ref={registerNode ? (el) => registerNode(field.id, el) : undefined}
      data-testid={`ds-canvas-field-${field.type}`}
      data-field-id={field.id}
      onPointerDown={interactive ? (e) => onPointerDown?.(e, field) : undefined}
      onDoubleClick={interactive ? (e) => onDoubleClick?.(e, field) : undefined}
      className="select-none"
      style={{
        ...style,
        cursor,
        outline,
        outlineOffset: 1,
        // Hidden fields stay visible-but-ghosted while editing so they can be found.
        ...(field.visible === false && interactive ? { opacity: 0.25, outline: '1px dashed #f43f5e' } : null),
        pointerEvents: interactive && !field.locked ? 'auto' : 'none'
      }}
    >
      {inner}
    </div>
  );
}
