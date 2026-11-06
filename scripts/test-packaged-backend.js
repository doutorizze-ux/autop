const { spawn } = require('child_process');
const path = require('path');

const baseDir = path.resolve('dist-installer/win-unpacked/resources/app');
const backendDir = path.join(baseDir, 'backend');
const scriptPath = path.join(backendDir, 'dist/index.js');
const exePath = path.resolve('dist-installer/win-unpacked/Centro Automotivo 0058.exe');

console.log('Script path:', scriptPath);
console.log('Exe path:', exePath);

const p = spawn(exePath, [scriptPath], {
  cwd: backendDir,
  env: {
    ...process.env,
    PORT: '5001',
    NODE_ENV: 'production',
    ELECTRON_RUN_AS_NODE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

p.stdout.on('data', d => console.log('STDOUT:', d.toString()));
p.stderr.on('data', d => console.log('STDERR:', d.toString()));
p.on('error', err => console.log('ERR:', err));
p.on('exit', code => {
  console.log('EXIT CODE:', code);
  process.exit(0);
});

setTimeout(() => {
  console.log('Timing out after 10s');
  p.kill();
  process.exit(0);
}, 10000);
