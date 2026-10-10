const { spawn } = require('child_process');
const path = require('path');

/**
 * Sends a sketch image + text prompt to the AI vision model / CV layout engine.
 * The sketch is base64-encoded and processed by sketchBridge.py.
 */
function generateDesignFromSketch({ system, user, sketchBase64, sketchMime, signal }) {
  const provider = process.env.AI_PROVIDER || 'gemini';
  const model = process.env.AI_VISION_MODEL || process.env.AI_MODEL || 'gemini-2.5-flash';
  const pythonBin = process.env.AI_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [path.join(__dirname, 'sketchBridge.py')], {
      cwd: path.join(__dirname, '..', '..'),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let failed = false;
    let stderrBytes = 0;
    let stderrMsg = '';

    const abort = () => child.kill('SIGKILL');
    const timeout = setTimeout(abort, 90000); // Vision requests may take longer
    signal?.addEventListener('abort', abort, { once: true });

    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (output.length > 200000) abort();
    });

    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      stderrMsg += chunk.toString();
    });

    child.on('error', (err) => {
      failed = true;
      console.warn('[AI sketch bridge spawn error]:', err.message);
    });

    child.on('close', code => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      if (code !== 0 || failed || output.length > 200000) {
        console.warn('[AI sketch bridge close]', { exit_code: code, stderr: stderrMsg.slice(0, 300), output_bytes: output.length });
        return reject(new Error('AI vision provider unavailable'));
      }
      try {
        resolve(JSON.parse(output));
      } catch (err) {
        console.warn('[AI sketch bridge parse error]', err.message, 'Output:', output.slice(0, 200));
        reject(new Error('Invalid AI vision response'));
      }
    });

    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({
      provider,
      model,
      system,
      user,
      sketch_base64: sketchBase64,
      sketch_mime: sketchMime
    }));
  });
}

module.exports = { generateDesignFromSketch };
