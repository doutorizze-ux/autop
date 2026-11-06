const fs = require('fs');
const path = require('path');

const p = path.resolve(__dirname, '../scraping/engine.js');
let c = fs.readFileSync(p, 'utf8');

const target = `    let context;
    if (effectiveProfilePath) {
        // Tenta usar o Chrome real (channel: chrome) para bypassar Cloudflare.
        // Se falhar (ex: Chrome não instalado), cai de volta para o Chromium.
        try {
            context = await launchPersistentContextWithRecovery(effectiveProfilePath, {
                headless: forceVisiblePersistentContext ? false : process.env.HEADLESS !== 'false',
                ...contextOptions,
                channel: 'chrome',
                ignoreDefaultArgs: ['--enable-automation'],
                args: systemChromeProfileRoot
                    ? [...(contextOptions.args || []), '--profile-directory=Default']
                    : contextOptions.args,
            }, supplier.name);
        } catch (error) {`;

const replacement = `    let context;
    if (effectiveProfilePath) {
        const installedExe = resolveInstalledBrowserExecutable();
        try {
            const launchOpts = {
                headless: forceVisiblePersistentContext ? false : process.env.HEADLESS !== 'false',
                ...contextOptions,
                ignoreDefaultArgs: ['--enable-automation'],
                args: systemChromeProfileRoot
                    ? [...(contextOptions.args || []), '--profile-directory=Default']
                    : contextOptions.args,
            };
            if (installedExe) {
                launchOpts.executablePath = installedExe;
            } else {
                launchOpts.channel = 'chrome';
            }
            context = await launchPersistentContextWithRecovery(effectiveProfilePath, launchOpts, supplier.name);
        } catch (error) {`;

if (c.includes('channel: \'chrome\',')) {
    c = c.replace(target, replacement);
    fs.writeFileSync(p, c, 'utf8');
    console.log('Successfully updated scraping/engine.js');
} else {
    console.log('Pattern not found, checking alternatives...');
}
