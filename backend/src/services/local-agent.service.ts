import { randomUUID } from 'crypto';

type AgentTask = {
    id: string;
    supplier: any;
    productName: string;
    createdAt: number;
    claimedBy?: string;
    claimedAt?: number;
    status: 'pending' | 'claimed' | 'completed' | 'failed';
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    timer: NodeJS.Timeout;
};

type ConnectedAgent = {
    id: string;
    name: string;
    version: string;
    lastSeenAt: number;
};

const connectedAgents = new Map<string, ConnectedAgent>();
const pendingTasks = new Map<string, AgentTask>();
const agentTimeoutMs = 45_000;
const taskTimeoutMs = 180_000;

function cleanupAgents() {
    const now = Date.now();
    for (const [agentId, agent] of connectedAgents.entries()) {
        if (now - agent.lastSeenAt > agentTimeoutMs) {
            connectedAgents.delete(agentId);
        }
    }
}

function cleanupClaimedTask(task: AgentTask, reason: string) {
    if (!pendingTasks.has(task.id)) return;
    pendingTasks.delete(task.id);
    clearTimeout(task.timer);
    task.reject(new Error(reason));
}

export class LocalAgentService {
    static heartbeat(agentId: string, name = 'Agente Local', version = '1.0.0') {
        cleanupAgents();

        const normalizedId = String(agentId || '').trim();
        if (!normalizedId) {
            throw new Error('Agente local sem identificador.');
        }

        connectedAgents.set(normalizedId, {
            id: normalizedId,
            name: String(name || 'Agente Local').trim() || 'Agente Local',
            version: String(version || '1.0.0').trim() || '1.0.0',
            lastSeenAt: Date.now(),
        });

        return {
            ok: true,
            agentsOnline: connectedAgents.size,
        };
    }

    static hasActiveAgents() {
        cleanupAgents();
        return connectedAgents.size > 0;
    }

    static listAgents() {
        cleanupAgents();
        return Array.from(connectedAgents.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    }

    static dispatchSearchTask(supplier: any, productName: string) {
        const taskId = randomUUID();

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const existing = pendingTasks.get(taskId);
                if (!existing) return;
                cleanupClaimedTask(existing, `Agente local nao respondeu para ${supplier.name}.`);
            }, taskTimeoutMs);

            pendingTasks.set(taskId, {
                id: taskId,
                supplier,
                productName,
                createdAt: Date.now(),
                status: 'pending',
                resolve,
                reject,
                timer,
            });
        });
    }

    static nextTask(agentId: string, name = 'Agente Local', version = '1.0.0') {
        this.heartbeat(agentId, name, version);

        const task = Array.from(pendingTasks.values())
            .filter((entry) => entry.status === 'pending')
            .sort((a, b) => a.createdAt - b.createdAt)[0];

        if (!task) {
            return null;
        }

        task.status = 'claimed';
        task.claimedBy = agentId;
        task.claimedAt = Date.now();

        return {
            id: task.id,
            supplier: task.supplier,
            productName: task.productName,
        };
    }

    static completeTask(agentId: string, taskId: string, result: any) {
        const task = pendingTasks.get(taskId);
        if (!task) {
            throw new Error('Tarefa do agente local nao encontrada.');
        }
        if (task.claimedBy && task.claimedBy !== agentId) {
            throw new Error('Tarefa pertence a outro agente.');
        }

        pendingTasks.delete(taskId);
        clearTimeout(task.timer);
        task.status = 'completed';
        task.resolve(result);
        return { ok: true };
    }

    static failTask(agentId: string, taskId: string, error: string) {
        const task = pendingTasks.get(taskId);
        if (!task) {
            throw new Error('Tarefa do agente local nao encontrada.');
        }
        if (task.claimedBy && task.claimedBy !== agentId) {
            throw new Error('Tarefa pertence a outro agente.');
        }

        cleanupClaimedTask(task, error || 'Falha no agente local.');
        return { ok: true };
    }
}
