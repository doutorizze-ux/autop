async function run() {
    const res = await fetch('https://portal.kaizenautopecas.com.br/assets/Login-mOZ1zGeK.js');
    const t = await res.text();
    const idx = t.indexOf('Entrar');
    console.log(t.substring(idx - 300, idx + 100));
}
run();
