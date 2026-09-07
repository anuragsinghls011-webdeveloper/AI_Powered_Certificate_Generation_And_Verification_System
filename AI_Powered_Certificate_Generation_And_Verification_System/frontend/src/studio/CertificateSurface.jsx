import React from 'react';
import { PAGE_W, PAGE_H, SCALE_Y, num, clamp, textLayout } from './constants';
import { borderLayers, borderLayerStyle, backgroundStyle, OBJECT_FITS } from './geometry';
import FieldView from './FieldView';

/**
 * Read-only render of a certificate page at an arbitrary scale.
 *
 * Shared by the editor canvas and the template gallery thumbnails, which is why
 * it owns the paint order (background → image → watermark → borders → fields) —
 * the same order backend/modules/bulkGeneration/certificateRenderer.js uses.
 *
 * `children` are drawn in page coordinates on top of the page but outside the
 * clipping layer, so editor overlays (guides, handles) are never cut off.
 */
export default function CertificateSurface({
  template,
  scale = 1,
  interactive = false,
  selectedIds = [],
  onFieldPointerDown,
  onFieldDoubleClick,
  registerNode,
  onPointerDown,
  pageRef,
  testId,
  children
}) {
  const fields = Array.isArray(template.fields) ? template.fields : [];
  const selected = new Set(selectedIds);
  const watermark = (template.watermark_text || '').trim();

  let watermarkStyle = null;
  if (watermark) {
    const size = Math.max(8, num(template.watermark_size, 72));
    // Mirrors the renderer: 72pt Helvetica-Bold, centred, rotated -30° about the
    // page centre, drawn at y = pageH/2 - size*0.6.
    const layout = textLayout({ fontFamily: 'Helvetica', fontWeight: 'bold', fontSize: size / SCALE_Y }, 1);
    const baseTop = PAGE_H / 2 - size * 0.6;
    watermarkStyle = {
      position: 'absolute',
      left: 0,
      top: baseTop + layout.topOffset,
      width: PAGE_W,
      textAlign: 'center',
      whiteSpace: 'nowrap',
      fontFamily: layout.fontFamily,
      fontWeight: 700,
      fontSize: `${size}px`,
      lineHeight: `${size}px`,
      color: template.watermark_color || '#94a3b8',
      opacity: clamp(num(template.watermark_opacity, 0.08), 0, 1),
      transform: 'rotate(-30deg)',
      transformOrigin: `${PAGE_W / 2}px ${size * 0.6 - layout.topOffset}px`,
      pointerEvents: 'none'
    };
  }

  return (
    <div style={{ width: PAGE_W * scale, height: PAGE_H * scale }} className="relative">
      <div
        ref={pageRef}
        data-testid={testId}
        onPointerDown={onPointerDown}
        style={{
          width: PAGE_W,
          height: PAGE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'relative'
        }}
      >
        {/* Everything the PDF page contains — clipped exactly like the page is */}
        <div className="absolute inset-0 overflow-hidden" style={backgroundStyle(template)}>
          {template.background_image && (
            <img
              src={template.background_image}
              alt=""
              draggable={false}
              className="absolute inset-0 w-full h-full"
              style={{
                objectFit: OBJECT_FITS[template.background_fit] || 'fill',
                objectPosition: 'center',
                opacity: clamp(num(template.background_opacity, 1), 0, 1)
              }}
            />
          )}

          {watermarkStyle && <div style={watermarkStyle}>{watermark}</div>}

          {borderLayers(template).map((layer, i) => (
            <div key={`border-${i}`} style={borderLayerStyle(layer)} />
          ))}

          {fields.map((f) => (
            <FieldView
              key={f.id}
              field={f}
              template={template}
              scale={scale}
              interactive={interactive}
              selected={selected.has(f.id)}
              onPointerDown={onFieldPointerDown}
              onDoubleClick={onFieldDoubleClick}
              registerNode={registerNode}
            />
          ))}
        </div>

        {children}
      </div>
    </div>
  );
}
