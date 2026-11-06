const fs = require('fs');
const path = require('path');

// 1. Dashboard.tsx
const dashPath = path.join(__dirname, '../frontend/src/pages/Dashboard.tsx');
let dashContent = fs.readFileSync(dashPath, 'utf8');
dashContent = dashContent.replace(
  '{themeLogo ? (',
  "{(themeLogo || '/logo.png') ? ("
);
dashContent = dashContent.replace(
  '<img src={themeLogo} alt="Logo" className="logo-image" />',
  '<img src={themeLogo || "/logo.png"} alt="Centro Automotivo 0058" className="logo-image" style={{ maxHeight: "64px", width: "auto", objectFit: "contain" }} />'
);
dashContent = dashContent.replace(
  '<span className="brand-kicker">Autopecas</span>',
  '<span className="brand-kicker">Centro Automotivo</span>'
);
dashContent = dashContent.replace(
  '<h2>AutoCRM</h2>',
  '<h2>0058</h2>'
);
fs.writeFileSync(dashPath, dashContent, 'utf8');

// 2. Login.tsx
const loginPath = path.join(__dirname, '../frontend/src/pages/Login.tsx');
let loginContent = fs.readFileSync(loginPath, 'utf8');
loginContent = loginContent.replace(
  `{themeLogo ? (\n            <img src={themeLogo} alt="Logo da loja" />\n          ) : (\n            <h1>Sistema de Atendimento</h1>\n          )}`,
  `<img src={themeLogo || '/logo.png'} alt="Centro Automotivo 0058" style={{ maxHeight: '90px', width: 'auto', objectFit: 'contain', margin: '0 auto 12px auto', display: 'block' }} />\n          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Centro Automotivo 0058</h1>`
);
// Also fallback if line breaks were CRLF:
loginContent = loginContent.replace(
  /\{themeLogo \? \([\s\S]*?<h1>Sistema de Atendimento<\/h1>[\s\S]*?\)\}/,
  `<img src={themeLogo || '/logo.png'} alt="Centro Automotivo 0058" style={{ maxHeight: '90px', width: 'auto', objectFit: 'contain', margin: '0 auto 12px auto', display: 'block' }} />\n          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Centro Automotivo 0058</h1>`
);
fs.writeFileSync(loginPath, loginContent, 'utf8');

// 3. package.json root
const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.name = 'centro-automotivo-0058';
pkg.description = 'Centro Automotivo 0058 - Gestão & Cotações';
pkg.build = pkg.build || {};
pkg.build.productName = 'Centro Automotivo 0058';
pkg.build.appId = 'com.centroautomotivo0058.app';
pkg.build.win = pkg.build.win || {};
pkg.build.win.icon = 'build/icon.ico';
pkg.build.nsis = pkg.build.nsis || {};
pkg.build.nsis.shortcutName = 'Centro Automotivo 0058';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');

// 4. electron/main.js
const mainJsPath = path.join(__dirname, '../electron/main.js');
let mainJs = fs.readFileSync(mainJsPath, 'utf8');
mainJs = mainJs.replace(/title:\s*['"][^'"]*['"]/g, "title: 'Centro Automotivo 0058'");
if (!mainJs.includes("icon: path.join(__dirname, '../build/icon.ico')") && !mainJs.includes("icon: path.join(__dirname, '../build/icon.png')")) {
  mainJs = mainJs.replace(
    /webPreferences:\s*\{/,
    "icon: path.join(__dirname, '../build/icon.ico'),\n    webPreferences: {"
  );
}
fs.writeFileSync(mainJsPath, mainJs, 'utf8');

console.log('Rebranding updated successfully!');
