const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const logFile = path.resolve('backend-test.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const exe = path.resolve('dist-installer/win-unpacked/Centro Automotivo 0058.exe');
const baseDir = path.resolve('dist-installer/win-unpacked/resources/app');
const backendDir = path.join(baseDir, 'backend');
const scriptPath = path.join(backendDir, 'dist/index.js');

console.log('Spawning backend...');

const child = spawn(exe, [scriptPath], {
  cwd: backendDir,
  env: {
    ...process.env,
    PORT: '5004',
    NODE_ENV: 'production',
    ELECTRON_RUN_AS_NODE: '1'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

child.stdout.pipe(logStream);
child.stderr.pipe(logStream);

setTimeout(async () => {
  try {
    const res = await fetch('http://localhost:5004/api/health');
    const data = await res.json();
    console.log('PORT 5004 HEALTH OK:', data);
  } catch (e) {
    console.log('PORT 5004 HEALTH FAIL:', e.message);
  }
  console.log('Log file content:');
  console.log(fs.readFileSync(logFile, 'utf8'));
  child.kill();
  process.exit(0);
}, 4000);
