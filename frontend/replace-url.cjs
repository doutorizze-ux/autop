const fs = require('fs');
const path = require('path');
function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if(file.endsWith('.tsx') || file.endsWith('.ts')) results.push(file);
        }
    });
    return results;
}
const files = walk('src');
let changedCount = 0;
for(const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    // single quotes
    content = content.replace(/'http:\/\/localhost:5000([^']*)'/g, "`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}$1`");
    // double quotes
    content = content.replace(/"http:\/\/localhost:5000([^"]*)"/g, "`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}$1`");
    // backticks
    content = content.replace(/`http:\/\/localhost:5000([^`]*)`/g, "`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}$1`");
    
    // Fix for socket.ts, which doesn't import meta env. Wait, vite apps can use import.meta.env anywhere.
    
    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        changedCount++;
        console.log('Updated ' + file);
    }
}
console.log('Changed ' + changedCount + ' files');
