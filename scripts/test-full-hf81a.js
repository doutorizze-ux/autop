async function testFull() {
  const loginRes = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@autopecas.com', password: '123456' })
  });
  const { token } = await loginRes.json();

  const searchRes = await fetch('http://localhost:5000/api/quotes/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ items: [{ query: 'hf81a' }] })
  });
  const { jobId } = await searchRes.json();
  console.log('Started job:', jobId);

  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`http://localhost:5000/api/quotes/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const job = await res.json();
    console.log(`Status: ${job.status}`);
    if (job.status === 'completed' || job.status === 'failed') {
      console.log('FINAL JOB RESULT:', JSON.stringify(job, null, 2));
      break;
    }
  }
}

testFull().catch(console.error);
