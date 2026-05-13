import { randomUUID } from 'crypto';

type SearchTaskPayload = {
    kind: 'search';
    supplier: any;
    productName: string;
};

type SessionTaskPayload = {
    kind: 'supplier-session';
    supplier: any;
    action: 'start' | 'snapshot' | 'click' | 'type' | 'press' | 'save' | 'stop';
    payload?: Record<string, any>;
};

type AgentTaskPayload = SearchTaskPayload | SessionTaskPayload;

type AgentTask = {
    id: string;
    payload: AgentTaskPayload;
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
    supplierFilters: string[];
    lastSeenAt: number;
};

type TaskKindFilter = AgentTaskPayload['kind'] | 'any';

const connectedAgents = new Map<string, ConnectedAgent>();
const pendingTasks = new Map<string, AgentTask>();
const agentTimeoutMs = Number.parseInt(process.env.LOCAL_AGENT_HEARTBEAT_TIMEOUT_MS || '45000', 10) || 45_000;
const taskTimeoutMs = Number.parseInt(process.env.LOCAL_AGENT_TASK_TIMEOUT_MS || '180000', 10) || 180_000;
const sessionTaskTimeoutMs = Number.parseInt(process.env.LOCAL_AGENT_SESSION_TASK_TIMEOUT_MS || '120000', 10) || 120_000;

function normalizeSupplierFilter(value: unknown) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function normalizeSupplierFilters(values?: unknown[]) {
    if (!Array.isArray(values)) return [];

    return Array.from(
        new Set(
            values
                .map(normalizeSupplierFilter)
                .filter(Boolean)
        )
    );
}

function getTaskSupplierFilters(task: AgentTask) {
    const supplier = task.payload.supplier;
    return [
        supplier?.id,
        supplier?.name,
        supplier?.type,
    ].map(normalizeSupplierFilter).filter(Boolean);
}

function agentAcceptsSupplier(agent: ConnectedAgent, supplier: any) {
    if (agent.supplierFilters.length === 0) {
        return true;
    }

    const supplierKeys = [
        supplier?.id,
        supplier?.name,
        supplier?.type,
    ].map(normalizeSupplierFilter).filter(Boolean);

    return supplierKeys.some((key) => agent.supplierFilters.includes(key));
}

function agentAcceptsTask(agent: ConnectedAgent, task: AgentTask) {
    if (agent.supplierFilters.length === 0) {
        return true;
    }

    const taskSupplierFilters = getTaskSupplierFilters(task);
    return taskSupplierFilters.some((key) => agent.supplierFilters.includes(key));
}

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

function releaseTasksClaimedByOfflineAgents() {
    for (const task of pendingTasks.values()) {
        if (task.status !== 'claimed' || !task.claimedBy) continue;
        if (connectedAgents.has(task.claimedBy)) continue;

        task.status = 'pending';
        task.claimedBy = undefined;
        task.claimedAt = undefined;
    }
}

export class LocalAgentService {
    static heartbeat(agentId: string, name = 'Agente Local', version = '1.0.0', supplierFilters?: unknown[]) {
        cleanupAgents();

        const normalizedId = String(agentId || '').trim();
        if (!normalizedId) {
            throw new Error('Agente local sem identificador.');
        }

        connectedAgents.set(normalizedId, {
            id: normalizedId,
            name: String(name || 'Agente Local').trim() || 'Agente Local',
            version: String(version || '1.0.0').trim() || '1.0.0',
            supplierFilters: normalizeSupplierFilters(supplierFilters),
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

    static hasActiveAgentsForSupplier(supplier: any) {
        cleanupAgents();
        return Array.from(connectedAgents.values()).some((agent) => agentAcceptsSupplier(agent, supplier));
    }

    static listAgents() {
        cleanupAgents();
        return Array.from(connectedAgents.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    }

    static dispatchTask(payload: AgentTaskPayload, timeoutMs = taskTimeoutMs) {
        const taskId = randomUUID();

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                const existing = pendingTasks.get(taskId);
                if (!existing) return;
                const taskLabel = existing.payload.kind === 'search'
                    ? `${existing.payload.supplier.name}`
                    : `${existing.payload.supplier.name} (${existing.payload.action})`;
                cleanupClaimedTask(existing, `Agente local nao respondeu para ${taskLabel}.`);
            }, timeoutMs);

            pendingTasks.set(taskId, {
                id: taskId,
                payload,
                createdAt: Date.now(),
                status: 'pending',
                resolve,
                reject,
                timer,
            });
        });
    }

    static dispatchSearchTask(supplier: any, productName: string) {
        return this.dispatchTask({
            kind: 'search',
            supplier,
            productName,
        });
    }

    static dispatchSessionTask(
        supplier: any,
        action: SessionTaskPayload['action'],
        payload?: Record<string, any>,
    ) {
        return this.dispatchTask(
            {
                kind: 'supplier-session',
                supplier,
                action,
                payload,
            },
            sessionTaskTimeoutMs,
        );
    }

    static nextTask(agentId: string, name = 'Agente Local', version = '1.0.0', preferredKind: TaskKindFilter = 'any', supplierFilters?: unknown[]) {
        this.heartbeat(agentId, name, version, supplierFilters);
        releaseTasksClaimedByOfflineAgents();

        const agent = connectedAgents.get(agentId);
        if (!agent) {
            return null;
        }

        const pending = Array.from(pendingTasks.values())
            .filter((entry) => entry.status === 'pending')
            .filter((entry) => agentAcceptsTask(agent, entry))
            .sort((a, b) => a.createdAt - b.createdAt);

        const prioritizedKinds = preferredKind === 'any'
            ? ['supplier-session', 'search']
            : [preferredKind];

        let task: AgentTask | null = null;
        for (const kind of prioritizedKinds) {
            task = pending.find((entry) => entry.payload.kind === kind) || null;
            if (task) break;
        }

        if (!task) {
            return null;
        }

        task.status = 'claimed';
        task.claimedBy = agentId;
        task.claimedAt = Date.now();

        return {
            id: task.id,
            ...task.payload,
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
