// Hosted chat and sketch generation use the model API directly, without Python.
class AiProviderError extends Error {
  constructor(code, publicMessage, httpStatus = 503) {
    super(publicMessage);
    this.name = 'AiProviderError';
    this.code = code;
    this.publicMessage = publicMessage;
    this.httpStatus = httpStatus;
  }
}

const key = name => (process.env[name] || '').trim();

function configuredProvider() {
  if (process.env.AI_PROVIDER === 'local') return null;
  if (process.env.AI_PROVIDER === 'openai' && key('OPENAI_API_KEY')) return 'openai';
  if (process.env.AI_PROVIDER === 'gemini' && (key('GEMINI_API_KEY') || key('GOOGLE_API_KEY'))) return 'gemini';
  if (key('GEMINI_API_KEY') || key('GOOGLE_API_KEY')) return 'gemini';
  if (key('OPENAI_API_KEY')) return 'openai';
  return null;
}

function providerError(status) {
  if (status === 401 || status === 403) return new AiProviderError('AI_KEY_REJECTED',
    'The AI service rejected the backend API key. Ask the site administrator to check the key and its permissions.');
  if (status === 404) return new AiProviderError('AI_MODEL_UNAVAILABLE',
    'The selected AI model is unavailable for this key. Ask the site administrator to update the model setting.');
  if (status === 429) return new AiProviderError('AI_QUOTA_EXCEEDED',
    'The AI service quota or rate limit has been reached. Please try again later or ask the administrator to check billing.', 429);
  if (status >= 500) return new AiProviderError('AI_SERVICE_BUSY',
    'The AI service is temporarily unavailable. Please retry in a moment.');
  return new AiProviderError('AI_REQUEST_REJECTED',
    'The AI service could not process this design request. Try a shorter instruction.', 502);
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function requestDesign({ system, user, sketchBase64, sketchMime, signal }) {
  const provider = configuredProvider();
  if (!provider) return null;

  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, sketchBase64 ? 80000 : 42000);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();

  const isGemini = provider === 'gemini';
  const explicitModel = sketchBase64 ? process.env.AI_VISION_MODEL : process.env.AI_MODEL;
  // Try the configured model first, then current Flash options if it is unavailable.
  const models = isGemini
    ? Array.from(new Set([explicitModel?.trim(), 'gemini-flash-latest', 'gemini-3.6-flash'].filter(Boolean)))
    : [(sketchBase64 ? process.env.OPENAI_VISION_MODEL : process.env.OPENAI_MODEL) || 'gpt-4o-mini'];

  try {
    for (const model of models) {
      if (isGemini && !/^[a-zA-Z0-9._-]+$/.test(model)) {
        throw new AiProviderError('AI_MODEL_UNAVAILABLE', 'The backend AI model setting is invalid.');
      }
      const url = isGemini
        ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
        : 'https://api.openai.com/v1/chat/completions';
      const headers = isGemini
        ? { 'Content-Type': 'application/json', 'x-goog-api-key': key('GEMINI_API_KEY') || key('GOOGLE_API_KEY') }
        : { 'Content-Type': 'application/json', Authorization: `Bearer ${key('OPENAI_API_KEY')}` };
      const payload = isGemini ? {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [
          { text: user },
          ...(sketchBase64 ? [{ inlineData: { mimeType: sketchMime, data: sketchBase64 } }] : [])
        ] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.25 }
      } : {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: sketchBase64 ? [
            { type: 'text', text: user },
            { type: 'image_url', image_url: { url: `data:${sketchMime};base64,${sketchBase64}` } }
          ] : user }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.25
      };

      for (let attempt = 0; attempt < 2; attempt++) {
        let response;
        try {
          response = await fetch(url, {
            method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal
          });
        } catch (error) {
          if (controller.signal.aborted) throw new AiProviderError('AI_TIMEOUT',
            'The AI service took too long to respond. Please try again.');
          throw new AiProviderError('AI_NETWORK_ERROR',
            'The backend could not reach the AI service. Please try again shortly.');
        }

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const rawReason = body.error?.details?.find(detail => typeof detail.reason === 'string')?.reason;
          const providerReason = /^[A-Z_]{1,50}$/.test(rawReason || '') ? rawReason : undefined;
          console.warn('[AI HTTP provider]', { provider, model, status: response.status,
            providerStatus: body.error?.status || undefined, providerReason });
          if (isGemini && response.status === 404 && models.length > 1) break;
          if (response.status >= 500 && attempt === 0 && !controller.signal.aborted) {
            await pause(900);
            continue;
          }
          throw providerError(response.status);
        }

        let data;
        try { data = await response.json(); } catch {
          throw new AiProviderError('AI_INVALID_RESPONSE', 'The AI service returned an unreadable design. Please retry.', 502);
        }
        const content = isGemini
          ? data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('')
          : data.choices?.[0]?.message?.content;
        if (!content || content.length > 160000) {
          throw new AiProviderError('AI_INVALID_RESPONSE', 'The AI service returned an empty design. Please retry.', 502);
        }
        try { return JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch {
          throw new AiProviderError('AI_INVALID_RESPONSE', 'The AI service returned an invalid design. Please retry.', 502);
        }
      }
    }
    throw providerError(404);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

module.exports = { AiProviderError, configuredProvider, requestDesign };
