import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';
import {
  PAGE_W, PAGE_H, SCALE_Y, CANVAS_W, CANVAS_H, num,
  isImageField, isTextField
} from './constants';
import {
  snapTargets, snapAdjust, snapToGrid, unionBox, marqueeRect, boxesIntersect
} from './geometry';
import CertificateSurface from './CertificateSurface';

const MIN_SIZE = 12;
const NO_FIELDS = [];

/**
 * The editable canvas: a true-to-size PDF page plus editor chrome (grid, rulers,
 * snap guides, marquee, resize/rotate handles).
 *
 * Field geometry is authoritative in the template; every gesture converts
 * pointer movement into design-space deltas and hands them back through
 * `onFieldsChange`. Measured boxes come from offsetLeft/offsetWidth, which ignore
 * the CSS scale and rotation, so they are stable page-space rectangles.
 */
export default function Canvas({
  template,
  selectedIds,
  onSelect,
  previewMode,
  zoom,
  gridEnabled,
  gridSize,
  snapEnabled,
  onBeginGesture,
  onFieldsChange,
  onFieldDoubleClick,
  onWidthChange,
  registerNode,
  measureBoxes
}) {
  const wrapRef = useRef(null);
  const pageRef = useRef(null);
  const gesture = useRef(null);
  const [guides, setGuides] = useState([]);
  const [marquee, setMarquee] = useState(null);
  const [, forceTick] = useState(0);

  // A stable empty array keeps the effect dependencies below from re-firing.
  const fields = Array.isArray(template.fields) ? template.fields : NO_FIELDS;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  /* --- measuring ------------------------------------------------------- */

  const pagePoint = useCallback((e) => {
    const rect = pageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  }, [zoom]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) onWidthChange?.(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onWidthChange]);

  // Handles are positioned from measured boxes, so re-render once fields settle.
  useEffect(() => { forceTick((t) => t + 1); }, [fields, zoom, selectedIds]);

  /* --- gestures -------------------------------------------------------- */

  const endGesture = useCallback(() => {
    gesture.current = null;
    setGuides([]);
    setMarquee(null);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      const g = gesture.current;
      if (!g) return;

      const rect = pageRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = (e.clientX - rect.left) / zoom;
      const py = (e.clientY - rect.top) / zoom;
      const dx = px - g.startX;
      const dy = py - g.startY;

      if (g.kind === 'marquee') {
        setMarquee(marqueeRect({ x: g.startX, y: g.startY }, { x: px, y: py }));
        return;
      }

      if (g.kind === 'move') {
        let adjX = dx;
        let adjY = dy;

        if (gridEnabled && gridSize > 0) {
          const lead = g.origins[g.leadId];
          adjX = snapToGrid(lead.x + dx, gridSize) - lead.x;
          adjY = (snapToGrid(lead.y + dy / SCALE_Y, gridSize) - lead.y) * SCALE_Y;
        }

        if (snapEnabled && g.union) {
          const moved = { ...g.union, x: g.union.x + adjX, y: g.union.y + adjY };
          const hit = snapAdjust(moved, g.targets, 6);
          adjX += hit.dx;
          adjY += hit.dy;
          setGuides(hit.guides);
        }

        const finalX = adjX;
        const finalY = adjY / SCALE_Y;
        onFieldsChange((list) =>
          list.map((f) => {
            const origin = g.origins[f.id];
            if (!origin) return f;
            return { ...f, x: Math.round(origin.x + finalX), y: Math.round(origin.y + finalY) };
          })
        );
        return;
      }

      if (g.kind === 'resize') {
        const o = g.origin;
        onFieldsChange((list) =>
          list.map((f) => {
            if (f.id !== g.id) return f;
            switch (g.handle) {
              case 'left': {
                const width = Math.max(MIN_SIZE, o.width - dx);
                return { ...f, x: Math.round(o.x + (o.width - width)), width: Math.round(width) };
              }
              case 'right':
                return { ...f, width: Math.round(Math.max(MIN_SIZE, o.width + dx)) };
              case 'corner': {
                if (f.type === 'certificate_qr') {
                  const size = Math.max(MIN_SIZE, o.width + Math.max(dx, dy));
                  return { ...f, width: Math.round(size), height: Math.round(size) };
                }
                return {
                  ...f,
                  width: Math.round(Math.max(MIN_SIZE, o.width + dx)),
                  height: Math.round(Math.max(MIN_SIZE, o.height + dy / SCALE_Y))
                };
              }
              default:
                return f;
            }
          })
        );
        return;
      }

      if (g.kind === 'rotate') {
        const angle = (Math.atan2(py - g.pivotY, px - g.pivotX) * 180) / Math.PI;
        let next = g.startRotation + (angle - g.startAngle);
        if (e.shiftKey) next = Math.round(next / 15) * 15;
        next = Math.round(((next % 360) + 360) % 360);
        onFieldsChange((list) => list.map((f) => (f.id === g.id ? { ...f, rotation: next } : f)));
      }
    };

    const onUp = () => {
      const g = gesture.current;
      if (g?.kind === 'marquee') {
        const rect = marqueeRect({ x: g.startX, y: g.startY }, g.last || { x: g.startX, y: g.startY });
        if (rect.w > 3 || rect.h > 3) {
          const boxes = measureBoxes();
          const hits = fields.filter((f) => boxes[f.id] && boxesIntersect(rect, boxes[f.id])).map((f) => f.id);
          onSelect(g.additive ? Array.from(new Set([...g.baseSelection, ...hits])) : hits);
        }
      }
      endGesture();
    };

    const trackLast = (e) => {
      const g = gesture.current;
      if (g?.kind !== 'marquee') return;
      const rect = pageRef.current?.getBoundingClientRect();
      if (!rect) return;
      g.last = { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointermove', trackLast);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointermove', trackLast);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [zoom, gridEnabled, gridSize, snapEnabled, fields, onFieldsChange, onSelect, measureBoxes, endGesture]);

  const beginMove = (e, field) => {
    if (previewMode || field.locked) return;
    e.stopPropagation();

    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    let ids;
    if (additive) {
      ids = selectedSet.has(field.id) ? selectedIds.filter((id) => id !== field.id) : [...selectedIds, field.id];
      onSelect(ids);
      if (!ids.includes(field.id)) return;
    } else {
      ids = selectedSet.has(field.id) ? selectedIds : [field.id];
      if (!selectedSet.has(field.id)) onSelect(ids);
    }

    const movable = fields.filter((f) => ids.includes(f.id) && !f.locked);
    if (!movable.length) return;

    const boxes = measureBoxes();
    const origins = {};
    for (const f of movable) origins[f.id] = { x: num(f.x), y: num(f.y) };

    const start = pagePoint(e);
    onBeginGesture();
    gesture.current = {
      kind: 'move',
      startX: start.x,
      startY: start.y,
      origins,
      leadId: field.id,
      union: unionBox(movable.map((f) => boxes[f.id]).filter(Boolean)),
      targets: snapTargets(fields.filter((f) => !ids.includes(f.id)).map((f) => boxes[f.id]).filter(Boolean))
    };
  };

  const beginResize = (e, field, handle) => {
    e.stopPropagation();
    const box = measureBoxes([field.id])[field.id];
    const start = pagePoint(e);
    onBeginGesture();
    gesture.current = {
      kind: 'resize',
      id: field.id,
      handle,
      startX: start.x,
      startY: start.y,
      origin: {
        x: num(field.x),
        width: num(field.width, box ? box.w : 100),
        height: num(field.height, box ? box.h / SCALE_Y : 40)
      }
    };
  };

  const beginRotate = (e, field) => {
    e.stopPropagation();
    const start = pagePoint(e);
    const pivotX = num(field.x);
    const pivotY = num(field.y) * SCALE_Y;
    onBeginGesture();
    gesture.current = {
      kind: 'rotate',
      id: field.id,
      startX: start.x,
      startY: start.y,
      pivotX,
      pivotY,
      startRotation: num(field.rotation, 0),
      startAngle: (Math.atan2(start.y - pivotY, start.x - pivotX) * 180) / Math.PI
    };
  };

  const beginMarquee = (e) => {
    if (previewMode) return;
    if (e.button !== 0) return;
    const start = pagePoint(e);
    const additive = e.shiftKey;
    if (!additive) onSelect([]);
    gesture.current = {
      kind: 'marquee',
      startX: start.x,
      startY: start.y,
      additive,
      baseSelection: selectedIds,
      last: start
    };
    setMarquee({ x: start.x, y: start.y, w: 0, h: 0 });
  };

  /* --- overlays -------------------------------------------------------- */

  const boxes = measureBoxes();
  const selectedFields = fields.filter((f) => selectedSet.has(f.id));
  const single = selectedFields.length === 1 ? selectedFields[0] : null;
  const singleBox = single ? boxes[single.id] : null;
  const multiBox = selectedFields.length > 1
    ? unionBox(selectedFields.map((f) => boxes[f.id]).filter(Boolean))
    : null;

  const handleSize = 9 / zoom;
  const hairline = 1 / zoom;

  const handleList = [];
  if (single && singleBox && !previewMode && !single.locked) {
    if (isTextField(single)) {
      handleList.push({ key: 'left', x: singleBox.x, y: singleBox.y + singleBox.h / 2, cursor: 'ew-resize' });
      handleList.push({ key: 'right', x: singleBox.x + singleBox.w, y: singleBox.y + singleBox.h / 2, cursor: 'ew-resize' });
    } else if (single.type === 'divider') {
      handleList.push({ key: 'right', x: singleBox.x + singleBox.w, y: singleBox.y + singleBox.h / 2, cursor: 'ew-resize' });
    } else if (isImageField(single) || single.type === 'certificate_qr') {
      handleList.push({ key: 'corner', x: singleBox.x + singleBox.w, y: singleBox.y + singleBox.h, cursor: 'nwse-resize' });
    }
  }

  const gridStyle = gridEnabled
    ? {
        backgroundImage:
          `repeating-linear-gradient(to right, rgba(37,99,235,0.14) 0 ${hairline}px, transparent ${hairline}px ${gridSize}px),` +
          `repeating-linear-gradient(to bottom, rgba(37,99,235,0.14) 0 ${hairline}px, transparent ${hairline}px ${gridSize * SCALE_Y}px)`
      }
    : null;

  const xTicks = [];
  const yTicks = [];
  for (let x = 0; x <= CANVAS_W; x += 50) xTicks.push(x);
  for (let y = 0; y <= CANVAS_H; y += 50) yTicks.push(y);

  return (
    <div className="bg-slate-100 rounded-2xl p-3 border border-slate-200 shadow-inner">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {previewMode ? 'Live Preview' : 'Editable Canvas'} · {PAGE_W} × {PAGE_H} pt
        </span>
        <span className="text-[11px] text-slate-400 font-mono">
          {Math.round(zoom * 100)}% · {fields.length} fields
          {selectedIds.length > 1 ? ` · ${selectedIds.length} selected` : ''}
        </span>
      </div>

      <div ref={wrapRef} className="overflow-auto">
        {/* Ruler strip */}
        {!previewMode && (
          <div className="flex" style={{ paddingLeft: 18 }}>
            <div
              className="relative bg-white border border-slate-200 rounded-t-md overflow-hidden"
              style={{ width: PAGE_W * zoom, height: 16 }}
            >
              {xTicks.map((x) => (
                <div key={x} className="absolute top-0 h-full" style={{ left: x * zoom }}>
                  <div className="w-px h-2 bg-slate-300" />
                  <span className="absolute left-1 top-0 text-[8px] text-slate-400 font-mono">{x}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex">
          {!previewMode && (
            <div
              className="relative bg-white border border-slate-200 rounded-l-md overflow-hidden"
              style={{ width: 18, height: PAGE_H * zoom }}
            >
              {yTicks.map((y) => (
                <div key={y} className="absolute left-0 w-full" style={{ top: y * SCALE_Y * zoom }}>
                  <div className="h-px w-2 bg-slate-300" />
                  <span className="absolute left-0.5 top-0.5 text-[8px] text-slate-400 font-mono">{y}</span>
                </div>
              ))}
            </div>
          )}

          <div className="shadow-2xl bg-white" style={{ width: PAGE_W * zoom, height: PAGE_H * zoom }}>
            <CertificateSurface
              template={template}
              scale={zoom}
              interactive={!previewMode}
              selectedIds={previewMode ? [] : selectedIds}
              onFieldPointerDown={beginMove}
              onFieldDoubleClick={onFieldDoubleClick}
              registerNode={registerNode}
              onPointerDown={beginMarquee}
              pageRef={pageRef}
              testId="ds-canvas"
            >
              {/* --- editor overlays, page coordinates, never clipped --- */}
              {gridStyle && (
                <div className="absolute inset-0 pointer-events-none" style={gridStyle} />
              )}

              {guides.map((g, i) => (
                <div
                  key={`guide-${i}`}
                  className="absolute pointer-events-none"
                  style={
                    g.axis === 'x'
                      ? { left: g.pos, top: 0, width: hairline, height: PAGE_H, background: '#ec4899' }
                      : { left: 0, top: g.pos, width: PAGE_W, height: hairline, background: '#ec4899' }
                  }
                />
              ))}

              {marquee && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: marquee.x,
                    top: marquee.y,
                    width: marquee.w,
                    height: marquee.h,
                    border: `${hairline}px dashed #2563eb`,
                    background: 'rgba(37,99,235,0.08)'
                  }}
                />
              )}

              {multiBox && (
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: multiBox.x - 2 / zoom,
                    top: multiBox.y - 2 / zoom,
                    width: multiBox.w + 4 / zoom,
                    height: multiBox.h + 4 / zoom,
                    border: `${hairline}px dashed #2563eb`
                  }}
                />
              )}

              {handleList.map((h) => (
                <div
                  key={h.key}
                  onPointerDown={(e) => beginResize(e, single, h.key)}
                  title={`Resize (${h.key})`}
                  style={{
                    position: 'absolute',
                    left: h.x - handleSize / 2,
                    top: h.y - handleSize / 2,
                    width: handleSize,
                    height: handleSize,
                    background: '#ffffff',
                    border: `${Math.max(hairline, 1 / zoom)}px solid #2563eb`,
                    borderRadius: 2 / zoom,
                    cursor: h.cursor,
                    touchAction: 'none'
                  }}
                />
              ))}

              {single && singleBox && !previewMode && !single.locked && (
                <div
                  onPointerDown={(e) => beginRotate(e, single)}
                  title="Drag to rotate · hold Shift for 15° steps"
                  style={{
                    position: 'absolute',
                    left: singleBox.x + singleBox.w / 2 - handleSize / 2,
                    top: singleBox.y - 22 / zoom,
                    width: handleSize,
                    height: handleSize,
                    display: 'grid',
                    placeItems: 'center',
                    background: '#2563eb',
                    color: '#fff',
                    borderRadius: '50%',
                    cursor: 'grab',
                    touchAction: 'none'
                  }}
                >
                  <RotateCw style={{ width: handleSize * 0.7, height: handleSize * 0.7 }} />
                </div>
              )}
            </CertificateSurface>
          </div>
        </div>
      </div>
    </div>
  );
}
