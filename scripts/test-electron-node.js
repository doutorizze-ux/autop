const { spawn } = require('child_process');
const electron = require('electron');

const child = spawn(electron, ['-e', 'console.log("ELECTRON AS NODE SUCCESS:", process.version)'], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
});

child.stdout.on('data', d => console.log(d.toString().trim()));
child.stderr.on('data', d => console.error(d.toString().trim()));
child.on('exit', code => console.log('Exit code:', code));
