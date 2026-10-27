import { Request, Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { LocalAgentService } from '../services/local-agent.service';

function readAgentToken(req: Request) {
    return String(req.headers['x-local-agent-token'] || req.body?.token || '').trim();
}

function readBearerToken(req: Request) {
    const authHeader = String(req.headers.authorization || '').trim();
    if (!authHeader) return '';

    const parts = authHeader.split(' ');
    if (parts.length !== 2) return '';

    const [scheme, token] = parts;
    if (!/^Bearer$/i.test(scheme)) return '';
    return String(token || '').trim();
}

/**
 * O agente (extensao do Chrome) se autentica pelo header x-local-agent-token,
 * comparado com LOCAL_AGENT_TOKEN do .env.
 *
 * A versao anterior liberava tudo com `return true`, deixando o barramento de
 * tarefas aberto: qualquer processo na maquina podia puxar e responder cotacoes
 * em nome do lojista. Se LOCAL_AGENT_TOKEN nao estiver definido, mantemos a
 * permissividade para nao quebrar o ambiente de desenvolvimento.
 */
function isAuthorized(req: Request) {
    const expected = String(process.env.LOCAL_AGENT_TOKEN || '').trim();
    if (!expected) return true;

    const provided = readAgentToken(req) || readBearerToken(req);
    if (!provided) return false;

    // Comparacao de tempo constante: nao vaza o token por diferenca de resposta.
    const expectedBuffer = Buffer.from(expected);
    const providedBuffer = Buffer.from(provided);
    if (expectedBuffer.length !== providedBuffer.length) return false;

    return timingSafeEqual(expectedBuffer, providedBuffer);
}

function readAgentIdentity(req: Request) {
    const rawId = req.body?.agentId || req.headers['x-local-agent-id'];
    return {
        id: String(rawId || 'chrome-extension').trim() || 'chrome-extension',
        name: String(req.body?.agentName || req.headers['x-local-agent-name'] || 'Extensao Chrome').trim() || 'Extensao Chrome',
        version: String(req.body?.version || req.headers['x-local-agent-version'] || '2.1.0').trim() || '2.1.0',
    };
}

function readSupplierFilters(req: Request) {
    const bodyFilters = req.body?.supplierFilters;
    if (Array.isArray(bodyFilters)) {
        return bodyFilters;
    }

    const raw = String(req.body?.supplierFilter || req.headers['x-local-agent-suppliers'] || '').trim();
    if (!raw) {
        return [];
    }

    return raw.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export const agentHeartbeat = (req: Request, res: Response): void => {
    if (!isAuthorized(req)) {
        res.status(401).json({ message: 'Token do agente local invalido.' });
        return;
    }

    const identity = readAgentIdentity(req);
    if (!identity.id) {
        res.status(400).json({ message: 'agentId e obrigatorio.' });
        return;
    }

    res.json(LocalAgentService.heartbeat(identity.id, identity.name, identity.version, readSupplierFilters(req)));
};

export const pullNextAgentTask = (req: Request, res: Response): void => {
    if (!isAuthorized(req)) {
        res.status(401).json({ message: 'Token do agente local invalido.' });
        return;
    }

    const identity = readAgentIdentity(req);
    if (!identity.id) {
        res.status(400).json({ message: 'agentId e obrigatorio.' });
        return;
    }

    const preferredKindRaw = String(req.body?.preferredKind || req.query?.preferredKind || '').trim();
    const preferredKind = preferredKindRaw === 'search' || preferredKindRaw === 'supplier-session'
        ? preferredKindRaw
        : 'any';

    const task = LocalAgentService.nextTask(identity.id, identity.name, identity.version, preferredKind, readSupplierFilters(req));
    res.json({ task });
};

export const completeAgentTask = (req: Request, res: Response): void => {
    if (!isAuthorized(req)) {
        res.status(401).json({ message: 'Token do agente local invalido.' });
        return;
    }

    const identity = readAgentIdentity(req);
    if (!identity.id) {
        res.status(400).json({ message: 'agentId e obrigatorio.' });
        return;
    }

    try {
        const result = LocalAgentService.completeTask(identity.id, String(req.params.taskId || ''), req.body?.result);
        res.json(result);
    } catch (error) {
        res.status(400).json({
            message: error instanceof Error ? error.message : 'Nao foi possivel finalizar a tarefa.',
        });
    }
};

export const failAgentTask = (req: Request, res: Response): void => {
    if (!isAuthorized(req)) {
        res.status(401).json({ message: 'Token do agente local invalido.' });
        return;
    }

    const identity = readAgentIdentity(req);
    if (!identity.id) {
        res.status(400).json({ message: 'agentId e obrigatorio.' });
        return;
    }

    try {
        const result = LocalAgentService.failTask(identity.id, String(req.params.taskId || ''), String(req.body?.error || 'Falha no agente local.'));
        res.json(result);
    } catch (error) {
        res.status(400).json({
            message: error instanceof Error ? error.message : 'Nao foi possivel marcar a tarefa como falha.',
        });
    }
};

export const getLocalAgentStatus = (_req: Request, res: Response): void => {
    res.json({
        online: LocalAgentService.hasActiveAgents(),
        agents: LocalAgentService.listAgents(),
    });
};