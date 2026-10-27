async function test() {
    const res = await fetch('https://portal.kaizenautopecas.com.br/assets/index-UMwYhXNw.js');
    const text = await res.text();
    const idx = text.indexOf('baseURL');
    console.log('baseURL context:', idx !== -1 ? text.substring(idx - 100, idx + 200) : 'not found');
    const matches = Array.from(new Set(text.match(/https?:\/\/[^\s"'`]+/g) || []));
    console.log('URLs in index-UMwYhXNw.js:', matches);
}
test().catch(console.error);
