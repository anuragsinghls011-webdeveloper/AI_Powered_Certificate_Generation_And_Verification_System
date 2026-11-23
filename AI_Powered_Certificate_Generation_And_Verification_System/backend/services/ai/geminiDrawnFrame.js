const { PNG } = require('pngjs');
const { AiProviderError, requestDesign } = require('./aiHttpProvider');

const FRAME_INSTRUCTIONS = `Design a decorative landscape certificate border for the user's brief.
Return only JSON: {"paper":"#RRGGBB","ink":"#RRGGBB","accent":"#RRGGBB","borders":[{"inset":16,"weight":2,"color":"ink"}],"corner":[{"points":[[18,75],[18,18],[75,18]],"weight":2,"color":"accent"}]}.
Canvas is 1200 by 850 pixels. Design one top-left corner; it will be mirrored into all four corners.
Use 1-4 nested borders, inset 8-55 and weight 1-8. Compose 2-16 polylines of 2-48 vertices each for the corner motif.
Each coordinate must be 0-155 pixels. Use ink and accent as stroke color names, and keep the paper center blank.`;

function renderFrame(plan) {
  const invalid = () => new AiProviderError('AI_INVALID_RESPONSE', 'Gemini returned an incomplete frame design. Try generating again.', 502);
  const color = value => {
    if (typeof value !== 'string' || !/^#[a-f0-9]{6}$/i.test(value)) throw invalid();
    return parseInt(value.slice(1), 16) * 256 + 255;
  };
  if (!plan || !Array.isArray(plan.borders) || !plan.borders.length || plan.borders.length > 4 ||
      !Array.isArray(plan.corner) || !plan.corner.length || plan.corner.length > 16) throw invalid();
  const width = 1200;
  const height = 850;
  if (width * height > (Number(process.env.IMAGE_MAX_PIXELS) || 16000000)) {
    throw new AiProviderError('AI_IMAGE_LIMIT', 'The generated frame exceeds the template image limit.', 422);
  }
  const png = new PNG({ width, height });
  const paper = Buffer.alloc(4);
  paper.writeUInt32BE(color(plan.paper));
  png.data.fill(paper);
  const palette = { ink: color(plan.ink), accent: color(plan.accent) };
  function stroke(x1, y1, x2, y2, line) {
    if (!Object.hasOwn(palette, line.color) || !Number.isFinite(line.weight)) throw invalid();
    const weight = Math.max(1, Math.min(8, Math.round(line.weight)));
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2-x1), Math.abs(y2-y1))));
    for (let i = 0; i <= steps; i++) {
      const left = Math.round(x1 + (x2-x1)*i/steps - weight/2);
      const top = Math.round(y1 + (y2-y1)*i/steps - weight/2);
      for (let y = Math.max(0, top); y < Math.min(top+weight, png.height); y++)
        for (let x = Math.max(0, left); x < Math.min(left+weight, png.width); x++)
          png.data.writeUInt32BE(palette[line.color], 4*(y*png.width+x));
    }
  }
  for (const line of plan.borders) {
    if (!Number.isFinite(line?.inset)) throw invalid();
    const inset = Math.max(8, Math.min(55, line.inset));
    const right = width - 1 - inset;
    const bottom = height - 1 - inset;
    stroke(inset, inset, right, inset, line);
    stroke(inset, bottom, right, bottom, line);
    stroke(inset, inset, inset, bottom, line);
    stroke(right, inset, right, bottom, line);
  }
  for (const line of plan.corner) {
    if (!Array.isArray(line?.points) || line.points.length < 2 || line.points.length > 48 ||
        !line.points.every(p => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(v) && v >= 0 && v <= 155))) throw invalid();
    for (const flipX of [false,true]) for (const flipY of [false,true]) {
      const points = line.points.map(([x,y]) => [flipX ? png.width-1-x : x, flipY ? png.height-1-y : y]);
      for (let i = 1; i < points.length; i++) stroke(...points[i-1], ...points[i], line);
    }
  }
  return png;
}

async function generateDrawnFrame(prompt, signal) {
  const plan = await requestDesign({ system: FRAME_INSTRUCTIONS, user: prompt, provider: 'gemini', signal });
  const png = renderFrame(plan);
  const encoded = await new Promise((resolve, reject) => {
    const chunks = [];
    png.on('data', chunk => chunks.push(chunk));
    png.once('end', () => resolve(Buffer.concat(chunks)));
    png.once('error', reject);
    png.pack();
  });
  if (encoded.length > (Number(process.env.IMAGE_MAX_BYTES) || 4 * 1024 * 1024)) {
    throw new AiProviderError('AI_IMAGE_LIMIT', 'The generated frame exceeds the template image limit.', 422);
  }
  return { success: true, provider: 'gemini-drawn', image: 'data:image/png;base64,' + encoded.toString('base64') };
}

module.exports = { generateDrawnFrame };
