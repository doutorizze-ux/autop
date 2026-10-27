const fs = require('fs');
const path = require('path');

const enginePath = path.join(__dirname, '..', 'scraping', 'engine.js');
let content = fs.readFileSync(enginePath, 'utf8');

const oldDismiss = `    const dismissSelectors = [
        'button:has-text("Aceitar")',
        'button:has-text("Agora não")',
        'button:has-text("Agora nao")',
        'button:has-text("Permitir Cookies")',
        'button:has-text("Fechar")',
        '[aria-label="Close"]',
        '.modal button.close',
    ];`;

const newDismiss = `    const dismissSelectors = [
        'button:has-text("Aceitar")',
        'button:has-text("Agora não")',
        'button:has-text("Agora nao")',
        'button:has-text("Permitir Cookies")',
        'button:has-text("Fechar")',
        'button:has-text("OK")',
        'button:has-text("Ok")',
        'button:has-text("Entendi")',
        'button:has-text("ENTENDI E FECHAR")',
        'button.swal2-confirm',
        'button.swal2-close',
        '.swal2-actions button',
        '[aria-label="Close"]',
        '.modal button.close',
        '.close-modal',
        'button.close',
    ];`;

const oldNorm = oldDismiss.replace(/\r\n/g, '\n');
const contentNorm = content.replace(/\r\n/g, '\n');

if (contentNorm.includes(oldNorm)) {
    content = contentNorm.replace(oldNorm, newDismiss.replace(/\r\n/g, '\n'));
    fs.writeFileSync(enginePath, content, 'utf8');
    console.log('engine.js dismissSelectors updated successfully!');
} else {
    console.log('Target dismissSelectors not found.');
}
