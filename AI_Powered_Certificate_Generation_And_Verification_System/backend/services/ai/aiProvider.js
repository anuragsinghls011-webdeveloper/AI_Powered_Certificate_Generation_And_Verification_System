const { spawn } = require('child_process');
const path = require('path');

// Fixed, trusted bridge; provider-specific logic stays out of Express and the browser.
function generateDesign({ system, user, signal }) {
  const provider = process.env.AI_PROVIDER || 'gemini';
  const model = process.env.AI_MODEL || 'gemini-2.5-flash';
  const pythonBin = process.env.AI_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [path.join(__dirname, 'provider_bridge.py')], {
      cwd: path.join(__dirname, '..', '..'),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let failed = false;
    let stderrBytes = 0;
    const abort = () => child.kill('SIGKILL');
    const timeout = setTimeout(abort, 45000);
    signal?.addEventListener('abort', abort, { once: true });

    child.stdout.on('data', chunk => {
      output += chunk.toString();
      if (output.length > 160000) abort();
    });

    child.stderr.on('data', chunk => { stderrBytes += chunk.length; });
    child.on('error', () => { failed = true; });
    child.on('close', code => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      if (code !== 0 || failed || output.length > 160000) {
        console.warn('[AI bridge]', { exit_code: code, stderr_bytes: stderrBytes, output_bytes: output.length });
        return reject(new Error('AI provider unavailable'));
      }
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Error('Invalid AI response'));
      }
    });

    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ provider, model, system, user }));
  });
}

module.exports = { generateDesign };