const { generateDrawnFrame } = require('./geminiDrawnFrame');
const { imageSize } = require('image-size');
const { AiProviderError, providerError } = require('./aiHttpProvider');

async function generateBackground({ prompt, style, signal }) {
  const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  if (!key) throw new AiProviderError('AI_NOT_CONFIGURED', 'Set GEMINI_API_KEY on the backend to generate frames.');
  const model = (process.env.AI_IMAGE_MODEL || 'gemini-3.1-flash-image').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) throw new AiProviderError('AI_MODEL_UNAVAILABLE', 'Check the backend AI_IMAGE_MODEL setting.');
  const timeout = AbortSignal.timeout(110000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const brief = style ? prompt + '\nStyle: ' + style : prompt;
  const payload = {
    contents: [{ parts: [{ text: 'Draw a landscape certificate frame. Keep the central 75% blank for editable text. No lettering, numbers, signatures or QR codes. Requested design: ' + brief }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3' } }
  };
  let response, body;
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(payload), signal: requestSignal
    });
    if (response.ok) body = await response.json();
  } catch {
    if (requestSignal.aborted) throw new AiProviderError('AI_TIMEOUT', 'Gemini took too long to draw this frame. Please try again.', 504);
    throw new AiProviderError('AI_NETWORK_ERROR', 'The backend could not read the Gemini image service response.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    if ([404, 429, 503].includes(response.status)) return generateDrawnFrame(brief, requestSignal);
    throw providerError(response.status);
  }
  const parts = body.candidates?.[0]?.content?.parts || [];
  const image = parts.find(part => !part.thought && part.inlineData?.data)?.inlineData;
  if (typeof image?.data !== 'string' || !['image/png', 'image/jpeg'].includes(image.mimeType)) {
    throw new AiProviderError('AI_NO_IMAGE', 'Gemini returned no usable frame. Try another frame description.', 502);
  }
  const maxBytes = Number(process.env.IMAGE_MAX_BYTES) || 4 * 1024 * 1024;
  if (image.data.length > 4 * Math.ceil(maxBytes / 3)) throw new AiProviderError('AI_IMAGE_LIMIT', 'The generated frame exceeds the template image limit.', 422);
  try {
    const { type, width, height } = imageSize(Buffer.from(image.data, 'base64'));
    if (!width || !height || image.mimeType !== 'image/' + (type === 'jpg' ? 'jpeg' : type) ||
        width * height > (Number(process.env.IMAGE_MAX_PIXELS) || 16000000)) throw new Error();
  } catch {
    throw new AiProviderError('AI_INVALID_IMAGE', 'Gemini returned a frame the editor cannot use. Try generating again.', 502);
  }
  return { success: true, provider: 'gemini', image: 'data:' + image.mimeType + ';base64,' + image.data };
}

module.exports = { generateBackground };
