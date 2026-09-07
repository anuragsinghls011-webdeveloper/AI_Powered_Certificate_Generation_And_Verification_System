import { CANVAS_W, PAGE_W, PAGE_H, BORDER_INSET, SCALE_Y, num } from './constants';

/* ---------------------------------------------------------------------------
 * Border layers
 *
 * Mirror of borderLayers() in backend/modules/bulkGeneration/certificateRenderer.js.
 * Keep the two in sync — this is what makes the canvas border match the PDF.
 * -------------------------------------------------------------------------*/

export function borderLayers(template = {}) {
  const style = template.border_style || 'solid';
  if (style === 'none') return [];

  const w = Math.max(0.5, num(template.border_width, 4));
  const primary = template.primary_color || '#1e3a8a';
  const accent = template.secondary_color || '#eab308';
  const radius = Math.max(0, num(template.corner_radius, 0));
  const layers = [];

  const push = (inset, width, color, dashed = false) =>
    layers.push({ inset, width, color, dashed, radius: Math.max(0, radius - (inset - BORDER_INSET)) });

  switch (style) {
    case 'dashed':
      push(BORDER_INSET, w, primary, true);
      break;
    case 'double':
      push(BORDER_INSET, w, primary);
      push(BORDER_INSET + w + 3, Math.max(1, w / 2), primary);
      break;
    case 'ridge':
      push(BORDER_INSET, w, primary);
      push(BORDER_INSET + w, Math.max(1, w * 0.6), accent);
      break;
    default:
      push(BORDER_INSET, w, primary);
      break;
  }

  if (template.accent_ring !== false) push(BORDER_INSET + w + 8, 1.5, accent);
  return layers;
}

/**
 * CSS box for one border layer. PDFKit centres a stroke on its path, so the box
 * starts half a stroke outside the inset and the radius grows by the same half.
 */
export function borderLayerStyle(layer) {
  const half = layer.width / 2;
  return {
    position: 'absolute',
    left: layer.inset - half,
    top: layer.inset - half,
    width: PAGE_W - layer.inset * 2 + layer.width,
    height: PAGE_H - layer.inset * 2 + layer.width,
    border: `${layer.width}px ${layer.dashed ? 'dashed' : 'solid'} ${layer.color}`,
    borderRadius: layer.radius > 0 ? layer.radius + half : 0,
    pointerEvents: 'none'
  };
}

/** Page background paint (solid colour or two-stop gradient). */
export function backgroundStyle(template = {}) {
  if (template.gradient_enabled) {
    // Studio convention: 0deg = left→right, 90deg = top→bottom.
    // CSS measures from "to top" clockwise, hence the +90.
    const angle = num(template.gradient_angle, 90) + 90;
    return {
      background: `linear-gradient(${angle}deg, ${template.gradient_from || '#ffffff'}, ${template.gradient_to || '#e2e8f0'})`
    };
  }
  return { background: template.background_color || '#ffffff' };
}

export const OBJECT_FITS = { stretch: 'fill', cover: 'cover', contain: 'contain' };

/* ---------------------------------------------------------------------------
 * Boxes & selection
 *
 * All boxes are in *page pixels* (the 792 x 612 space the canvas renders at
 * zoom 1), which is also the space snap guides are drawn in.
 * -------------------------------------------------------------------------*/

export function unionBox(boxes) {
  if (!boxes.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const b of boxes) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const boxesIntersect = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function marqueeRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y)
  };
}

/* ---------------------------------------------------------------------------
 * Snapping
 * -------------------------------------------------------------------------*/

export const snapToGrid = (v, size) => (size > 0 ? Math.round(v / size) * size : v);

const MARGIN = 96; // the content column used by the starter layouts

/** Candidate alignment lines: page landmarks plus every unselected field's edges. */
export function snapTargets(boxes) {
  const vertical = [0, PAGE_W / 2, PAGE_W, BORDER_INSET, PAGE_W - BORDER_INSET, MARGIN, PAGE_W - MARGIN];
  const horizontal = [0, PAGE_H / 2, PAGE_H, BORDER_INSET, PAGE_H - BORDER_INSET, MARGIN, PAGE_H - MARGIN];
  for (const b of boxes) {
    vertical.push(b.x, b.x + b.w / 2, b.x + b.w);
    horizontal.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { vertical, horizontal };
}

/**
 * Nudges a dragged bounding box onto the nearest alignment lines.
 * @returns {{dx:number, dy:number, guides:Array<{axis:'x'|'y', pos:number}>}}
 */
export function snapAdjust(box, targets, threshold = 6) {
  const guides = [];
  let dx = 0;
  let dy = 0;

  const fit = (edges, lines) => {
    let best = null;
    for (const edge of edges) {
      for (const line of lines) {
        const dist = line - edge;
        if (Math.abs(dist) <= threshold && (!best || Math.abs(dist) < Math.abs(best.dist))) {
          best = { dist, line };
        }
      }
    }
    return best;
  };

  const hit = fit([box.x, box.x + box.w / 2, box.x + box.w], targets.vertical);
  if (hit) { dx = hit.dist; guides.push({ axis: 'x', pos: hit.line }); }

  const vhit = fit([box.y, box.y + box.h / 2, box.y + box.h], targets.horizontal);
  if (vhit) { dy = vhit.dist; guides.push({ axis: 'y', pos: vhit.line }); }

  return { dx, dy, guides };
}

/* ---------------------------------------------------------------------------
 * Align & distribute
 *
 * These return *deltas* keyed by field id rather than absolute coordinates: a
 * measured DOM box does not map back to field.x/field.y one-to-one (text boxes
 * carry a baseline correction), but a delta always does.
 * -------------------------------------------------------------------------*/

const PAGE_BOX = { x: 0, y: 0, w: PAGE_W, h: PAGE_H };

export function alignDeltas(ids, boxes, mode) {
  const picked = ids.map((id) => ({ id, box: boxes[id] })).filter((e) => e.box);
  if (!picked.length) return {};
  const ref = picked.length > 1 ? unionBox(picked.map((p) => p.box)) : PAGE_BOX;

  const out = {};
  for (const { id, box } of picked) {
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case 'left': dx = ref.x - box.x; break;
      case 'centerX': dx = ref.x + ref.w / 2 - (box.x + box.w / 2); break;
      case 'right': dx = ref.x + ref.w - (box.x + box.w); break;
      case 'top': dy = ref.y - box.y; break;
      case 'middleY': dy = ref.y + ref.h / 2 - (box.y + box.h / 2); break;
      case 'bottom': dy = ref.y + ref.h - (box.y + box.h); break;
      default: break;
    }
    out[id] = { dx, dy: dy / SCALE_Y };
  }
  return out;
}

export function distributeDeltas(ids, boxes, axis) {
  const picked = ids.map((id) => ({ id, box: boxes[id] })).filter((e) => e.box);
  if (picked.length < 3) return {};

  const horizontal = axis === 'x';
  picked.sort((a, b) => (horizontal ? a.box.x - b.box.x : a.box.y - b.box.y));

  const first = picked[0].box;
  const last = picked[picked.length - 1].box;
  const startCentre = horizontal ? first.x + first.w / 2 : first.y + first.h / 2;
  const endCentre = horizontal ? last.x + last.w / 2 : last.y + last.h / 2;
  const step = (endCentre - startCentre) / (picked.length - 1);

  const out = {};
  picked.forEach(({ id, box }, i) => {
    const target = startCentre + step * i;
    const centre = horizontal ? box.x + box.w / 2 : box.y + box.h / 2;
    const delta = target - centre;
    out[id] = horizontal ? { dx: delta, dy: 0 } : { dx: 0, dy: delta / SCALE_Y };
  });
  return out;
}

/* ---------------------------------------------------------------------------
 * Z-order
 *
 * Array order is paint order in both the canvas and the PDF, so "bring to
 * front" means "move to the end of the array".
 * -------------------------------------------------------------------------*/

export function reorderFields(fields, ids, action) {
  const set = new Set(ids);
  const selected = fields.filter((f) => set.has(f.id));
  if (!selected.length) return fields;
  const rest = fields.filter((f) => !set.has(f.id));

  if (action === 'front') return [...rest, ...selected];
  if (action === 'back') return [...selected, ...rest];

  const next = [...fields];
  const indexes = next.map((f, i) => (set.has(f.id) ? i : -1)).filter((i) => i >= 0);
  const order = action === 'forward' ? [...indexes].reverse() : indexes;

  for (const i of order) {
    const j = action === 'forward' ? i + 1 : i - 1;
    if (j < 0 || j >= next.length || set.has(next[j].id)) continue;
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

/** Keeps a field's origin on the page even after a big nudge. */
export function clampField(field) {
  return {
    ...field,
    x: Math.max(-200, Math.min(CANVAS_W + 200, Math.round(field.x))),
    y: Math.max(-200, Math.min(1000, Math.round(field.y)))
  };
}
