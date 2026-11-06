const { spawnSync } = require('child_process');
const path = require('path');

const exe = path.resolve('dist-installer/win-unpacked/Centro Automotivo 0058.exe');
const res = spawnSync(exe, ['-e', 'console.log("ELECTRON_RUN_AS_NODE_OK")'], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  encoding: 'utf8',
  timeout: 5000
});

console.log('Exit status:', res.status);
console.log('Stdout:', res.stdout);
console.log('Stderr:', res.stderr);
console.log('Error:', res.error);
