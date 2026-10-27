async function test() {
    const res = await fetch('https://portal.kaizenautopecas.com.br/assets/index-UMwYhXNw.js');
    const text = await res.text();
    const regex = /"(\/[a-zA-Z0-9_\-\/]{3,40})"/g;
    let match;
    const endpoints = new Set();
    while ((match = regex.exec(text)) !== null) {
        if (!match[1].includes('svg') && !match[1].includes('png') && !match[1].includes('jpg')) {
            endpoints.add(match[1]);
        }
    }
    console.log('Endpoints found:', Array.from(endpoints));
}
test().catch(console.error);
