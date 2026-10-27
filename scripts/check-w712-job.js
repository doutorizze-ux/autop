(async () => {
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@autopecas.com', password: '123456' })
    });
    const { token } = await loginRes.json();
    const jobRes = await fetch('http://localhost:5000/api/quotes/jobs/0b44368a-eaac-43d1-963d-7672147af98c', {
        headers: { Authorization: 'Bearer ' + token }
    });
    const job = await jobRes.json();
    console.log('JOB STATUS:', job.status);
    const matrix = job.matrix || {};
    const items = matrix['W712'] || [];
    console.log('Total items in matrix for W712:', items.length);
    for (const it of items) {
        console.log(`[${it.provider}] ${it.product} - R$ ${it.price} | Disp: ${it.available} | Erro: ${it.error || 'Nenhum'}`);
    }
})();
