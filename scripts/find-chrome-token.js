const fs = require('fs');
const path = require('path');

const leveldbDir = 'C:\\Users\\mauri\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Local Storage\\leveldb';
if (!fs.existsSync(leveldbDir)) {
    console.log('Dir does not exist');
    process.exit(1);
}

const files = fs.readdirSync(leveldbDir);
console.log('Files count:', files.length);

const foundTokens = new Set();

for (const file of files) {
    if (!file.endsWith('.ldb') && !file.endsWith('.log')) continue;
    try {
        const buf = fs.readFileSync(path.join(leveldbDir, file));
        const str = buf.toString('latin1');
        if (str.includes('kaizen')) {
            console.log('Found kaizen in', file);
            const matches = str.match(/eyJhbGciOi[A-Za-z0-9_\-\.]+/g) || [];
            for (const m of matches) {
                foundTokens.add(m);
            }
        }
    } catch (e) {
        // file locked or error
    }
}

console.log('Tokens found:', Array.from(foundTokens));
for (const t of foundTokens) {
    try {
        const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString('utf8'));
        console.log('Payload:', payload);
        console.log('Expired?', payload.exp ? new Date(payload.exp * 1000) : 'no exp');
    } catch (_) {}
}
