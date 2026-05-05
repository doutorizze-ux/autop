const os = require('os');
const path = require('path');
const { scrapeProduct } = require(path.resolve(__dirname, '../scraping/engine.js'));

const backendUrl = String(process.env.LOCAL_AGENT_BACKEND_URL || '').trim().replace(/\/+$/, '');
const agentToken = String(process.env.LOCAL_AGENT_TOKEN || '').trim();
const agentId = String(process.env.LOCAL_AGENT_ID || `${os.hostname()}-agent`).trim();
const agentName = String(process.env.LOCAL_AGENT_NAME || `Agente ${os.hostname()}`).trim();
const agentVersion = '1.0.0';
const pollIntervalMs = Number.parseInt(process.env.LOCAL_AGENT_POLL_INTERVAL_MS || '3000', 10) || 3000;

if (!backendUrl) {
    throw new Error('Defina LOCAL_AGENT_BACKEND_URL antes de iniciar o agente local.');
}

if (!agentToken) {
    throw new Error('Defina LOCAL_AGENT_TOKEN antes de iniciar o agente local.');
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-local-agent-token': agentToken,
            'x-local-agent-id': agentId,
            'x-local-agent-name': agentName,
            'x-local-agent-version': agentVersion,
        },
        body: JSON.stringify(body || {}),
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
        throw new Error(data?.message || `Falha HTTP ${response.status}`);
    }
    return data;
}

async function heartbeat() {
    return postJson(`${backendUrl}/api/local-agent/heartbeat`, {
        token: agentToken,
        agentId,
        agentName,
        version: agentVersion,
    });
}

async function nextTask() {
    return postJson(`${backendUrl}/api/local-agent/tasks/next`, {
        token: agentToken,
        agentId,
        agentName,
        version: agentVersion,
    });
}

async function completeTask(taskId, result) {
    return postJson(`${backendUrl}/api/local-agent/tasks/${taskId}/complete`, {
        token: agentToken,
        agentId,
        agentName,
        version: agentVersion,
        result,
    });
}

async function failTask(taskId, error) {
    return postJson(`${backendUrl}/api/local-agent/tasks/${taskId}/fail`, {
        token: agentToken,
        agentId,
        agentName,
        version: agentVersion,
        error: String(error || 'Falha no agente local.'),
    });
}

async function processTask(task) {
    console.log(`[Local Agent] Pesquisando ${task.supplier.name} -> ${task.productName}`);
    try {
        const result = await scrapeProduct(task.supplier, task.productName);
        await completeTask(task.id, result);
        console.log(`[Local Agent] Tarefa concluida: ${task.id}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Local Agent] Tarefa falhou ${task.id}: ${message}`);
        await failTask(task.id, message).catch(() => null);
    }
}

async function mainLoop() {
    console.log(`[Local Agent] Iniciado: ${agentName} (${agentId})`);
    console.log(`[Local Agent] Backend: ${backendUrl}`);

    while (true) {
        try {
            await heartbeat();
            const payload = await nextTask();
            if (payload?.task) {
                await processTask(payload.task);
                continue;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Local Agent] Erro no loop: ${message}`);
        }

        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
}

mainLoop().catch((error) => {
    console.error('[Local Agent] Encerrado com erro:', error);
    process.exit(1);
});
