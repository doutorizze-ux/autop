async function testApiQuote() {
    console.log('Sending search for hf81a to http://localhost:5000/api/quotes/search...');
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
            items: [{ query: 'hf81a', label: 'hf81a' }]
        })
    });

    console.log('Search HTTP Status:', searchRes.status);
    const searchData = await searchRes.json();
    console.log('Search Response:', searchData);
    const jobId = searchData.jobId;
    if (!jobId) return;

    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const jobRes = await fetch(`http://localhost:5000/api/quotes/jobs/${jobId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const jobData = await jobRes.json();
        console.log(`[${i * 2}s] Status: ${jobData.status}`);
        if (jobData.status === 'completed' || jobData.status === 'failed') {
            console.log('Job completed or failed:', jobData.status, jobData.error);
            break;
        }
    }
}

testApiQuote();
