import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
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

function isAuthorized(req: Request) {
    const expected = String(process.env.LOCAL_AGENT_TOKEN || '').trim();
    const agentToken = readAgentToken(req);
    if (expected && agentToken === expected) {
        return true;
    }

    const bearerToken = readBearerToken(req);
    if (!bearerToken) {
        return false;
    }

    try {
        jwt.verify(bearerToken, process.env.JWT_SECRET || 'secret');
        return true;
    } catch (_) {
        return false;
    }
}

function readAgentIdentity(req: Request) {
    return {
        id: String(req.body?.agentId || req.headers['x-local-agent-id'] || '').trim(),
        name: String(req.body?.agentName || req.headers['x-local-agent-name'] || 'Agente Local').trim() || 'Agente Local',
        version: String(req.body?.version || req.headers['x-local-agent-version'] || '1.0.0').trim() || '1.0.0',
    };
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

    res.json(LocalAgentService.heartbeat(identity.id, identity.name, identity.version));
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

    const task = LocalAgentService.nextTask(identity.id, identity.name, identity.version);
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
