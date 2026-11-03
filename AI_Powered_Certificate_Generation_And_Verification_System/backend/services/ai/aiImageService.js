const { spawn } = require('child_process');
const path = require('path');

function generateBackground({ prompt, style = '', signal }) {
  const pythonBin = process.env.AI_PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3');

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [path.join(__dirname, 'imageBridge.py')], {
      cwd: path.join(__dirname, '..', '..'),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let stderr = '';
    let failed = false;

    const abort = () => child.kill('SIGKILL');
    const timeout = setTimeout(abort, 60000);
    signal?.addEventListener('abort', abort, { once: true });

    child.stdout.on('data', chunk => {
      output += chunk.toString();
    });

    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', err => {
      failed = true;
      console.warn('[AI image bridge error]:', err.message);
    });

    child.on('close', code => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      if (code !== 0 || failed || !output.trim()) {
        console.warn('[AI image bridge close]', { exit_code: code, stderr: stderr.slice(0, 300) });
        return reject(new Error('Failed to generate background image'));
      }
      try {
        const parsed = JSON.parse(output);
        if (!parsed.image) throw new Error('Missing image data in response');
        resolve(parsed);
      } catch (err) {
        console.warn('[AI image bridge parse error]:', err.message);
        reject(new Error('Invalid image generation response'));
      }
    });

    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ prompt: (prompt || '').trim(), style: (style || '').trim() }));
  });
}

module.exports = { generateBackground };
