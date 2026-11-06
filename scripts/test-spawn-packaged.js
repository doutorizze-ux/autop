const { spawn } = require('child_process');
const path = require('path');

const exe = path.resolve('dist-installer/win-unpacked/Centro Automotivo 0058.exe');
const baseDir = path.resolve('dist-installer/win-unpacked/resources/app');
const backendDir = path.join(baseDir, 'backend');
const scriptPath = path.join(backendDir, 'dist/index.js');

console.log('Script exists:', require('fs').existsSync(scriptPath));

const p = spawn(exe, [scriptPath], {
  cwd: backendDir,
  env: {
    ...process.env,
    PORT: '5002',
    NODE_ENV: 'production',
    ELECTRON_RUN_AS_NODE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

p.stdout.on('data', d => console.log('[BACKEND STDOUT]', d.toString()));
p.stderr.on('data', d => console.log('[BACKEND STDERR]', d.toString()));
p.on('error', err => console.log('[SPAWN ERROR]', err));
p.on('exit', (code, sig) => console.log('[EXIT]', code, sig));

setTimeout(async () => {
  try {
    const res = await fetch('http://localhost:5002/api/health');
    const data = await res.json();
    console.log('HEALTH CHECK RESULT:', data);
  } catch (e) {
    console.error('HEALTH CHECK FAILED:', e.message);
  }
  p.kill();
  process.exit(0);
}, 6000);
