const fs = require('fs');

const path = 'scraping/engine.js';
let content = fs.readFileSync(path, 'utf8');

const oldCode = `async function persistSession(context, supplier, shouldPersist) {
    if (!shouldPersist || !supplier.needsLogin) {
        return;
    }

    const sessionStatePath = getSessionStatePath(supplier);
    await context.storageState({ path: sessionStatePath });
}`;

const newCode = `async function persistSession(context, supplier, shouldPersist) {
    if (!shouldPersist || !supplier.needsLogin) {
        return;
    }

    try {
        const sessionStatePath = getSessionStatePath(supplier);
        await context.storageState({ path: sessionStatePath });
    } catch (e) {
        console.warn(\`[WARN] Nao foi possivel persistir sessao em arquivo: \${e.message}\`);
    }
}`;

content = content.replace(/\r\n/g, '\n');
const normalizedOld = oldCode.replace(/\r\n/g, '\n');

if (content.includes(normalizedOld)) {
    content = content.replace(normalizedOld, newCode);
    fs.writeFileSync(path, content, 'utf8');
    console.log('PATCH_OK: engine.js persistSession wrapped in try/catch!');
} else {
    console.log('PATCH_FAIL: pattern not found');
}
