const fs = require('fs');
const path = require('path');

const p = path.resolve(__dirname, '../backend/src/index.ts');
let c = fs.readFileSync(p, 'utf8');

if (!c.includes('uncaughtException')) {
  c = `process.on('uncaughtException', (err) => console.error('[UNCAUGHT EXCEPTION]', err));\nprocess.on('unhandledRejection', (reason) => console.error('[UNHANDLED REJECTION]', reason));\n` + c;
}

c = c.replace('server.listen(PORT, async () => {', "server.listen(PORT, '0.0.0.0', async () => {");
fs.writeFileSync(p, c, 'utf8');
console.log('Successfully updated backend/src/index.ts');
