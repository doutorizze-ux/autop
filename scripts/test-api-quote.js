async function testApiQuote() {
    console.log('Sending search for PSL560 to http://localhost:5000/api/quotes/search...');
    let token = '';
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@autopecas.com', password: '123456' })
    });
    const data = await loginRes.json();
    token = data.token;

    if (!token) {
        console.error('Failed to log in to API');
        return;
    }

    console.log('Logged in, starting quote search...');
    const searchRes = await fetch('http://localhost:5000/api/quotes/search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
            items: [{ query: 'PSL560', label: 'PSL560' }]
        })
    });

    const searchData = await searchRes.json();
    const jobId = searchData.jobId;
    console.log('Job started with ID:', jobId);

    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const jobRes = await fetch(`http://localhost:5000/api/quotes/jobs/${jobId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const jobData = await jobRes.json();
        console.log(`[${i * 4}s] Status: ${jobData.status}`);
        if (jobData.status === 'completed' || jobData.status === 'failed') {
            const matrix = jobData.matrix || {};
            const psl = matrix['PSL560'] || [];
            console.log('\n=== RESULTADO FINAL DA COTAÇÃO PSL560 ===');
            console.log(`Total de fornecedores respondidos: ${psl.length}`);
            for (const item of psl) {
                console.log(`- ${item.provider}: ${item.available ? '✅ DISPONÍVEL R$ ' + item.price : '❌ ' + (item.error || 'Sem oferta')}`);
            }
            break;
        }
    }
}

testApiQuote().catch(console.error);
