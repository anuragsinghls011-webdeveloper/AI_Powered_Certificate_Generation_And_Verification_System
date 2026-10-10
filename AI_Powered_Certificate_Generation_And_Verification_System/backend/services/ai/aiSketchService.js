const { DesignValidationError, validateResponse, FIELD_TYPES, FONT_FAMILIES, TEMPLATE_RULES, FIELD_RULES } = require('./aiSchema');
const { normalizeModelOutput } = require('./aiModelNormalizer');
const { generateDesignFromSketch } = require('./aiSketchProvider');

// Maximum sketch image size: 4MB raw base64
const MAX_SKETCH_SIZE = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

const SKETCH_SYSTEM = `You are CampusCert Pro's certificate design assistant with VISION capability. You can analyze hand-drawn sketches and convert them into professional, editable certificate templates.

Your output is ONLY one JSON object (no markdown, no code fences).

ANALYZING THE SKETCH:
- Study the hand-drawn sketch carefully to understand the layout intention.
- Identify text placement zones, decorative elements, borders, signature areas, QR code placement.
- Map sketch regions to certificate field types (title, recipient name, event, date, QR, signature, etc.)
- Preserve the spatial relationships and visual hierarchy from the sketch.
- If the sketch shows a border pattern, translate it to the closest border_style (solid/double/dashed/ridge/none).
- Estimate positions from the sketch proportionally mapped to the 792x560 design canvas.

Canvas is 792x560 design units; landscape Letter PDF maps y to 612. Content margins >= 40; maximum x+width 760 and y+height 528. QR is square 72-120 units and clear of other content. Avoid overlapping visible text/QR. Keep text high-contrast against backgrounds and readable (metadata 9-13pt, body 12-18, title 22-32, name 30-48). Use intentional visual hierarchy: title, recipient, event/achievement, rank, metadata, then issuer and QR in a balanced footer. Keep spacing generous; pair a display serif with a readable sans when appropriate. All coordinates and sizes are numbers.

SUPPORTED FIELD TYPES: ${[...FIELD_TYPES].join(', ')}.
SUPPORTED FONT FAMILIES: ${[...FONT_FAMILIES].join(', ')}.
TEMPLATE CHANGE KEYS: ${Object.keys(TEMPLATE_RULES).join(', ')}. Field property keys: ${Object.keys(FIELD_RULES).join(', ')}. Colors MUST be #RRGGBB. Styles are modern/classic/minimal; borders are solid/double/dashed/ridge/none. Never set background_image, field image, remote URL, or any key not listed.

Return {"intent":"create","summary":"brief explanation of how the sketch was interpreted","template_changes":{},"field_operations":[{"type":"add_field","field_type":"supported type","properties":{}}],"design_notes":["what was interpreted from the sketch"],"warnings":[],"replace_existing_fields":true}.

IMPORTANT RULES:
- Always set replace_existing_fields to true since you are creating from a sketch.
- Always set intent to "create".
- Include a comprehensive set of fields: title, recipient_name, event_title, issue_date, certificate_id, certificate_qr, and any other fields suggested by the sketch.
- If the sketch shows a signature area, use issuer_name, issuer_title and a divider instead of signature_image.
- Never add logo_image or signature_image without an uploaded image.
- Apply the user's text prompt preferences (style, colors, theme) on top of the sketch layout.
- Generate visually polished designs with harmonious colors, good typography, and balanced spacing.
- Static headings/instructions use custom_text with text; dynamic recipient/event fields do not set text.
Respond in concise English. Strict JSON only.`;

function parseSketchRequest(body, file) {
  if (!body || typeof body !== 'object') throw new DesignValidationError('Invalid request');

  // Validate prompt
  const prompt = (body.prompt || '').trim();
  if (!prompt) throw new DesignValidationError('Describe your desired design style or theme');
  if (prompt.length > 1200) throw new DesignValidationError('Keep your instruction under 1,200 characters');

  // Validate sketch image
  let sketchBase64, sketchMime;

  if (file) {
    // From multer file upload
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new DesignValidationError('Only PNG, JPEG, and WebP sketch images are supported');
    }
    if (file.size > MAX_SKETCH_SIZE) {
      throw new DesignValidationError('Sketch image must be under 4MB');
    }
    sketchBase64 = file.buffer.toString('base64');
    sketchMime = file.mimetype;
  } else if (body.sketch_base64) {
    // From JSON body with base64 data
    if (typeof body.sketch_base64 !== 'string') throw new DesignValidationError('Invalid sketch data');
    const sizeEstimate = Math.ceil(body.sketch_base64.length * 0.75);
    if (sizeEstimate > MAX_SKETCH_SIZE) throw new DesignValidationError('Sketch image must be under 4MB');
    sketchBase64 = body.sketch_base64;
    sketchMime = body.sketch_mime || 'image/png';
    if (!ALLOWED_MIME_TYPES.includes(sketchMime)) {
      throw new DesignValidationError('Only PNG, JPEG, and WebP sketch images are supported');
    }
  } else {
    throw new DesignValidationError('Upload a sketch image to generate a design');
  }

  return { prompt, sketchBase64, sketchMime };
}

async function designFromSketch({ body, file, req, provider = generateDesignFromSketch, signal }) {
  const input = parseSketchRequest(body, file);

  const userPayload = JSON.stringify({
    request: input.prompt,
    context: 'The user has uploaded a hand-drawn sketch of a certificate template. Analyze the sketch layout and create a professional certificate design that follows the spatial arrangement shown in the sketch while applying the style described in the request.',
    current_design: { fields: [] } // Starting from empty since we're creating from sketch
  });

  const started = Date.now();
  try {
    let proposal;
    let lastReason = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const correction = attempt ? '\nIMPORTANT: Your previous response failed strict design validation. ' +
        `Validation issue: ${lastReason}. ` +
        'Follow the allowed schema, use only supported field types, positive field sizes and valid values, ' +
        'and ensure all operations use add_field (since this is a fresh design from sketch). Return ONLY corrected JSON.' : '';

      const output = await provider({
        system: SKETCH_SYSTEM + correction,
        user: userPayload,
        sketchBase64: input.sketchBase64,
        sketchMime: input.sketchMime,
        signal
      });

      try {
        const emptyTemplate = { fields: [] };
        proposal = validateResponse(normalizeModelOutput(output, emptyTemplate), emptyTemplate);
        break;
      } catch (err) {
        if (!(err instanceof DesignValidationError) || attempt) throw err;
        lastReason = err.message.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 70);
        console.warn('[AI sketch design]', { status: 'retry_invalid_output', validation_reason: err.message });
      }
    }

    const count = proposal.variants ? proposal.variants.reduce((n, v) => n + v.design.field_operations.length, 0)
      : proposal.field_operations.length;
    console.info('[AI sketch design]', { provider: process.env.AI_PROVIDER || 'gemini', status: 'valid',
      latency_ms: Date.now() - started, operation_count: count });
    return proposal;
  } catch (err) {
    console.warn('[AI sketch design]', { provider: process.env.AI_PROVIDER || 'gemini',
      status: err instanceof DesignValidationError ? 'invalid_output' : 'provider_error',
      error_type: err.name, validation_reason: err instanceof DesignValidationError ? err.message : undefined,
      latency_ms: Date.now() - started });
    throw err;
  }
}

module.exports = { parseSketchRequest, designFromSketch };
