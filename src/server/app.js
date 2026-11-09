import express, {} from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimulationEngine } from '../core/Engine.js';
import { EventStore } from '../storage/EventStore.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../../public');
const app = express();
const PORT = Number(process.env['PORT']) || 3000;
app.use(express.json());
app.use(express.static(publicDir));
// Initialize Event Store and 50x50 Simulation Engine
const eventStore = new EventStore({ inMemory: true });
const engine = new SimulationEngine({
    config: {
        gridWidth: 50,
        gridHeight: 50,
        cellSize: 1,
        tickRateMs: 50,
        allowDiagonal: true,
        snapshotIntervalTicks: 40,
        defaultAgentSpeed: 0.6,
    },
    eventStore,
});
// Seed initial obstacles (central maze/pillars)
const seedObstacles = [];
// Vertical wall with gaps
for (let y = 10; y <= 40; y++) {
    if (y !== 20 && y !== 30) {
        seedObstacles.push({ x: 25, y });
    }
}
// Horizontal barriers
for (let x = 12; x <= 22; x++) {
    seedObstacles.push({ x, y: 15 });
    seedObstacles.push({ x: x + 16, y: 35 });
}
for (const obs of seedObstacles) {
    engine.addObstacle(obs);
}
// Seed initial agents
const initialAgents = [
    { id: 'Agent-Alpha', position: { x: 5, y: 5 }, target: { x: 42, y: 42 }, speed: 0.6 },
    { id: 'Agent-Beta', position: { x: 44, y: 6 }, target: { x: 6, y: 44 }, speed: 0.5 },
    { id: 'Agent-Gamma', position: { x: 20, y: 44 }, target: { x: 20, y: 6 }, speed: 0.65 },
    { id: 'Agent-Delta', position: { x: 6, y: 25 }, target: { x: 44, y: 25 }, speed: 0.55 },
];
for (const a of initialAgents) {
    engine.spawnAgent(a);
}
// Continuous patrol: when an agent reaches destination, give it a new target
engine.on('AGENT_REACHED_TARGET', (event) => {
    setTimeout(() => {
        const current = engine.getAgent(event.agentId);
        if (!current || current.state !== 'COMPLETED') {
            return;
        }
        let targetX = Math.floor(Math.random() * 46) + 2;
        let targetY = Math.floor(Math.random() * 46) + 2;
        let attempts = 0;
        while (engine.spatialGrid.hasObstacle({ x: targetX, y: targetY }) && attempts < 20) {
            targetX = Math.floor(Math.random() * 46) + 2;
            targetY = Math.floor(Math.random() * 46) + 2;
            attempts++;
        }
        engine.setAgentTarget(event.agentId, { x: targetX, y: targetY });
    }, 1000);
});
// SSE Streaming Clients
const sseClients = new Set();
engine.onTick((tickEvent) => {
    if (sseClients.size === 0) {
        return;
    }
    const payload = JSON.stringify({
        type: 'TICK',
        tick: tickEvent.tick,
        timestamp: tickEvent.timestamp,
        activeAgents: tickEvent.activeAgents,
        agents: engine.getAllAgents(),
        obstacles: engine.spatialGrid.getAllObstacles(),
        events: tickEvent.events,
    });
    const sseData = `data: ${payload}\n\n`;
    for (const client of sseClients) {
        client.write(sseData);
    }
});
// Start simulation engine ticker
engine.start();
// --- REST Endpoints ---
/** Real-time SSE Stream */
app.get('/api/stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
    });
    res.write('\n');
    sseClients.add(res);
    // Send current full snapshot immediately to bootstrap client
    const snapshot = engine.getSnapshot();
    const initPayload = JSON.stringify({
        type: 'INIT',
        tick: snapshot.tick,
        timestamp: snapshot.timestamp,
        activeAgents: snapshot.agents.length,
        agents: snapshot.agents,
        obstacles: snapshot.obstacles,
        events: eventStore.getEvents(Math.max(0, snapshot.tick - 20)),
    });
    res.write(`data: ${initPayload}\n\n`);
    req.on('close', () => {
        sseClients.delete(res);
    });
});
/** Current state snapshot */
app.get('/api/state', (_req, res) => {
    const snapshot = engine.getSnapshot();
    res.json({
        tick: snapshot.tick,
        timestamp: snapshot.timestamp,
        activeAgents: snapshot.agents.length,
        agents: snapshot.agents,
        obstacles: snapshot.obstacles,
    });
});
/** Historical event log */
app.get('/api/events', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 50));
    const total = eventStore.getEventCount();
    const events = eventStore.getEvents();
    const sliced = events.slice(Math.max(0, events.length - limit));
    res.json({ total, events: sliced });
});
/** Add or remove dynamic obstacle at grid position */
app.post('/api/obstacles', (req, res) => {
    const x = Math.floor(Number(req.body.x));
    const y = Math.floor(Number(req.body.y));
    if (x < 0 || x >= 50 || y < 0 || y >= 50) {
        res.status(400).json({ success: false, message: 'Coordinates out of bounds (0-49)' });
        return;
    }
    const pos = { x, y };
    const has = engine.spatialGrid.hasObstacle(pos);
    if (has) {
        engine.removeObstacle(pos);
        // Unblocked: trigger path recalculations for blocked agents
        for (const agent of engine.getAllAgents()) {
            if (agent.state === 'BLOCKED' && agent.target) {
                engine.setAgentTarget(agent.id, agent.target);
            }
        }
        res.json({ success: true, action: 'removed', position: pos });
    }
    else {
        engine.addObstacle(pos);
        // Check all navigating agents whose upcoming paths collide with new obstacle
        for (const agent of engine.getAllAgents()) {
            if (agent.state === 'NAVIGATING' && agent.target) {
                const collides = agent.path.some((pt) => Math.floor(pt.x) === x && Math.floor(pt.y) === y);
                if (collides) {
                    // Immediately recalculate path to detour around newly added obstacle
                    engine.setAgentTarget(agent.id, agent.target);
                }
            }
        }
        res.json({ success: true, action: 'added', position: pos });
    }
});
/** Spawn a new agent at runtime */
app.post('/api/agents', (req, res) => {
    const id = req.body.id ? String(req.body.id) : `Agent-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const startX = Math.floor(Number(req.body.startX ?? Math.random() * 46 + 2));
    const startY = Math.floor(Number(req.body.startY ?? Math.random() * 46 + 2));
    const targetX = Math.floor(Number(req.body.targetX ?? Math.random() * 46 + 2));
    const targetY = Math.floor(Number(req.body.targetY ?? Math.random() * 46 + 2));
    try {
        const spawned = engine.spawnAgent({
            id,
            position: { x: startX, y: startY },
            target: { x: targetX, y: targetY },
            speed: 0.6,
        });
        res.json({ success: true, agent: spawned });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to spawn agent';
        res.status(400).json({ success: false, message: msg });
    }
});
/** Clear all obstacles */
app.post('/api/obstacles/clear', (_req, res) => {
    const all = engine.spatialGrid.getAllObstacles();
    for (const o of all) {
        engine.removeObstacle(o);
    }
    for (const agent of engine.getAllAgents()) {
        if (agent.target) {
            engine.setAgentTarget(agent.id, agent.target);
        }
    }
    res.json({ success: true, cleared: all.length });
});
/** Toggle simulation pause/resume */
app.post('/api/toggle-pause', (_req, res) => {
    if (engine.active) {
        engine.stop();
        res.json({ success: true, active: false });
    }
    else {
        engine.start();
        res.json({ success: true, active: true });
    }
});
app.listen(PORT, () => {
    console.log(`[chronos-sim] Server running at http://localhost:${PORT}`);
});
export { app, engine, eventStore };
//# sourceMappingURL=app.js.map