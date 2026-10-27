async function test() {
    const res = await fetch('https://portal.kaizenautopecas.com.br/assets/Login-mOZ1zGeK.js');
    const text = await res.text();
    const urls = Array.from(new Set(text.match(/https?:\/\/[^\s"'`]+/g) || []));
    console.log('URLs in Login js:', urls);
    
    // Look for login endpoint or turnstile check
    const matches = text.match(/(?:url|path|api|endpoint|service)[^,;]{1,60}/gi) || [];
    console.log('API hints:', matches.slice(0, 15));

    // Look for fetch or axios
    const idx = text.indexOf('post(');
    if (idx !== -1) {
        console.log('post context:', text.substring(idx - 100, idx + 300));
    }
    const idx2 = text.indexOf('fetch(');
    if (idx2 !== -1) {
        console.log('fetch context:', text.substring(idx2 - 100, idx2 + 300));
    }
}
test().catch(console.error);
