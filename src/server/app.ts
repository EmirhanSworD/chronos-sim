import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SimulationEngine } from '../core/Engine.js';
import { EventStore } from '../storage/EventStore.js';
import type { CellType, Threat, TickEvent, Vector2D } from '../core/Types.js';

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
    defaultMaxStamina: 100,
    defaultEnergyBurnRate: 0.4,
    threatEvasionDistance: 5.0,
    rechargeThresholdPercent: 20,
  },
  eventStore,
});

// 1. Seed Charging Stations
const stationPositions: Vector2D[] = [
  { x: 5, y: 5 },
  { x: 44, y: 44 },
  { x: 25, y: 25 },
];
for (const st of stationPositions) {
  engine.addStation(st);
}

// 2. Seed Roads (low cost 0.5)
for (let x = 0; x < 50; x++) {
  engine.setCellType({ x, y: 24 }, 'ROAD');
  engine.setCellType({ x, y: 25 }, 'ROAD');
}
for (let y = 0; y < 50; y++) {
  engine.setCellType({ x: 24, y }, 'ROAD');
  engine.setCellType({ x: 25, y }, 'ROAD');
}

// 3. Seed Mud Swamps (high cost 5.0)
for (let x = 8; x <= 16; x++) {
  for (let y = 8; y <= 16; y++) {
    if (x !== 5 || y !== 5) {
      engine.setCellType({ x, y }, 'MUD');
    }
  }
}
for (let x = 32; x <= 40; x++) {
  for (let y = 30; y <= 38; y++) {
    if (x !== 44 || y !== 44) {
      engine.setCellType({ x, y }, 'MUD');
    }
  }
}

// 4. Seed Dynamic Obstacle Barriers
const seedObstacles: Vector2D[] = [];
for (let y = 10; y <= 20; y++) {
  seedObstacles.push({ x: 30, y });
}
for (let x = 12; x <= 18; x++) {
  seedObstacles.push({ x, y: 35 });
}
for (const obs of seedObstacles) {
  engine.addObstacle(obs);
}

// 5. Seed Predator Threat
const predator: Threat = {
  id: 'Predator-Rex',
  position: { x: 35, y: 15 },
  radius: 1.0,
  speed: 0.3,
};
engine.addThreat(predator);

// 6. Seed Initial Agents with Stamina and Patrol Waypoints
const initialAgents = [
  {
    id: 'Agent-Alpha',
    position: { x: 6, y: 6 },
    waypoints: [{ x: 6, y: 6 }, { x: 23, y: 6 }, { x: 23, y: 23 }, { x: 6, y: 23 }],
    speed: 0.65,
    stamina: 85,
    maxStamina: 100,
    energyBurnRate: 0.5,
  },
  {
    id: 'Agent-Beta',
    position: { x: 42, y: 6 },
    waypoints: [{ x: 42, y: 6 }, { x: 42, y: 22 }, { x: 26, y: 22 }, { x: 26, y: 6 }],
    speed: 0.55,
    stamina: 90,
    maxStamina: 100,
    energyBurnRate: 0.45,
  },
  {
    id: 'Agent-Gamma',
    position: { x: 6, y: 42 },
    waypoints: [{ x: 6, y: 42 }, { x: 23, y: 42 }, { x: 23, y: 26 }, { x: 6, y: 26 }],
    speed: 0.6,
    stamina: 75,
    maxStamina: 100,
    energyBurnRate: 0.5,
  },
  {
    id: 'Agent-Delta',
    position: { x: 42, y: 42 },
    waypoints: [{ x: 42, y: 42 }, { x: 26, y: 42 }, { x: 26, y: 26 }, { x: 42, y: 26 }],
    speed: 0.5,
    stamina: 80,
    maxStamina: 100,
    energyBurnRate: 0.4,
  },
];

for (const a of initialAgents) {
  engine.spawnAgent(a);
}

// Animate predator patrol
let predatorAngle = 0;
setInterval(() => {
  if (!engine.active) return;
  predatorAngle += 0.05;
  const cx = 32 + Math.cos(predatorAngle) * 8;
  const cy = 18 + Math.sin(predatorAngle) * 8;
  engine.updateThreatPosition('Predator-Rex', { x: cx, y: cy });
}, 100);

// SSE Streaming Clients
const sseClients = new Set<Response>();

engine.onTick((tickEvent: TickEvent) => {
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
    cellTypes: engine.spatialGrid.getAllCellTypes(),
    threats: engine.getAllThreats(),
    stations: engine.getAllStations(),
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
app.get('/api/stream', (req: Request, res: Response): void => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  res.write('\n');
  sseClients.add(res);

  const snapshot = engine.getSnapshot();
  const initPayload = JSON.stringify({
    type: 'INIT',
    tick: snapshot.tick,
    timestamp: snapshot.timestamp,
    activeAgents: snapshot.agents.length,
    agents: snapshot.agents,
    obstacles: snapshot.obstacles,
    cellTypes: snapshot.cellTypes,
    threats: snapshot.threats,
    stations: snapshot.stations,
    events: eventStore.getEvents(Math.max(0, snapshot.tick - 30)),
  });
  res.write(`data: ${initPayload}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

/** Current state snapshot */
app.get('/api/state', (_req: Request, res: Response): void => {
  const snapshot = engine.getSnapshot();
  res.json({
    tick: snapshot.tick,
    timestamp: snapshot.timestamp,
    activeAgents: snapshot.agents.length,
    agents: snapshot.agents,
    obstacles: snapshot.obstacles,
    cellTypes: snapshot.cellTypes,
    threats: snapshot.threats,
    stations: snapshot.stations,
  });
});

/** Historical event log */
app.get('/api/events', (req: Request, res: Response): void => {
  const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 50));
  const total = eventStore.getEventCount();
  const events = eventStore.getEvents();
  const sliced = events.slice(Math.max(0, events.length - limit));
  res.json({ total, events: sliced });
});

/** Toggle or add obstacle */
app.post('/api/obstacles', (req: Request, res: Response): void => {
  const x = Math.floor(Number(req.body.x));
  const y = Math.floor(Number(req.body.y));

  if (x < 0 || x >= 50 || y < 0 || y >= 50) {
    res.status(400).json({ success: false, message: 'Coordinates out of bounds (0-49)' });
    return;
  }

  const pos: Vector2D = { x, y };
  const has = engine.spatialGrid.hasObstacle(pos);

  if (has) {
    engine.removeObstacle(pos);
    for (const agent of engine.getAllAgents()) {
      if (agent.state === 'BLOCKED' && agent.target) {
        engine.setAgentTarget(agent.id, agent.target);
      }
    }
    res.json({ success: true, action: 'removed', position: pos });
  } else {
    engine.addObstacle(pos);
    for (const agent of engine.getAllAgents()) {
      if ((agent.state === 'NAVIGATING' || agent.state === 'PATROL') && agent.target) {
        const collides = agent.path.some(
          (pt) => Math.floor(pt.x) === x && Math.floor(pt.y) === y
        );
        if (collides) {
          engine.setAgentTarget(agent.id, agent.target);
        }
      }
    }
    res.json({ success: true, action: 'added', position: pos });
  }
});

/** Set Terrain Cell Type (WALL, MUD, ROAD, STATION, EMPTY) */
app.post('/api/terrain', (req: Request, res: Response): void => {
  const x = Math.floor(Number(req.body.x));
  const y = Math.floor(Number(req.body.y));
  const rawType = String(req.body.type || 'EMPTY').toUpperCase();
  const validTypes: readonly CellType[] = ['EMPTY', 'WALL', 'MUD', 'ROAD', 'STATION'];

  if (!validTypes.includes(rawType as CellType)) {
    res.status(400).json({
      success: false,
      message: `Invalid cell type '${rawType}'. Valid types: ${validTypes.join(', ')}`,
    });
    return;
  }

  const type = rawType as CellType;

  if (x < 0 || x >= engine.config.gridWidth || y < 0 || y >= engine.config.gridHeight) {
    res.status(400).json({
      success: false,
      message: `Coordinates (${x}, ${y}) out of bounds (0-${engine.config.gridWidth - 1})`,
    });
    return;
  }

  engine.setCellType({ x, y }, type);
  res.json({
    success: true,
    position: { x, y },
    type,
    cost: engine.getCellCost({ x, y }),
  });
});

/** Spawn a dynamic moving threat (Predator) */
app.post('/api/spawn-threat', (req: Request, res: Response): void => {
  const id = req.body.id ? String(req.body.id) : `Threat-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  const x = Math.floor(Number(req.body.x ?? Math.random() * 40 + 5));
  const y = Math.floor(Number(req.body.y ?? Math.random() * 40 + 5));
  const speed = typeof req.body.speed === 'number' ? req.body.speed : 0.3;
  const radius = typeof req.body.radius === 'number' ? req.body.radius : 1.0;

  if (x < 0 || x >= engine.config.gridWidth || y < 0 || y >= engine.config.gridHeight) {
    res.status(400).json({ success: false, message: 'Threat coordinates out of bounds' });
    return;
  }

  const threat: Threat = {
    id,
    position: { x, y },
    speed,
    radius,
  };

  engine.addThreat(threat);
  res.json({ success: true, threat });
});

/** Alias for threat creation */
app.post('/api/threats', (req: Request, res: Response): void => {
  const id = req.body.id ? String(req.body.id) : 'Predator-User';
  const x = Math.floor(Number(req.body.x ?? 25));
  const y = Math.floor(Number(req.body.y ?? 25));

  engine.addThreat({
    id,
    position: { x, y },
    radius: 1.0,
  });

  res.json({ success: true, threat: { id, position: { x, y } } });
});

/** Time-Travel Replay: Retrieve continuous range of historical simulation frames */
app.get('/api/replay/range', (req: Request, res: Response): void => {
  const fromTick = Math.max(0, Number(req.query['from']) || 0);
  const toTick = Math.max(fromTick, Number(req.query['to']) || (fromTick + 50));
  const frames = eventStore.getHistoryRange(fromTick, toTick);

  res.json({
    success: true,
    fromTick,
    toTick,
    count: frames.length,
    frames,
  });
});

/** Time-Travel Replay: Retrieve exact simulation frame at a historical tick */
app.get('/api/replay/:tick', (req: Request, res: Response): void => {
  const tickParam = Number(req.params.tick);
  if (Number.isNaN(tickParam) || tickParam < 0) {
    res.status(400).json({ success: false, message: 'Invalid tick parameter. Expected non-negative integer.' });
    return;
  }

  const frame = eventStore.getFrame(tickParam);
  if (!frame) {
    res.status(404).json({
      success: false,
      message: `Simulation frame for tick #${tickParam} not found`,
      availableRange: {
        totalFrames: eventStore.getFrameCount(),
        latestFrame: eventStore.getLatestFrame()?.tick ?? null,
      },
    });
    return;
  }

  res.json({
    success: true,
    tick: tickParam,
    frame,
  });
});

/** Simulation Lifecycle & Execution Control (Pause, Play, Step, Speed, Seek) */
app.post('/api/control', (req: Request, res: Response): void => {
  const action = String(req.body.action || '').toLowerCase();

  switch (action) {
    case 'pause':
    case 'stop': {
      engine.stop();
      res.json({ success: true, action: 'pause', active: engine.active, tick: engine.tick });
      return;
    }

    case 'play':
    case 'resume':
    case 'start': {
      engine.start();
      res.json({ success: true, action: 'play', active: engine.active, tick: engine.tick });
      return;
    }

    case 'toggle': {
      if (engine.active) {
        engine.stop();
      } else {
        engine.start();
      }
      res.json({ success: true, action: 'toggle', active: engine.active, tick: engine.tick });
      return;
    }

    case 'step':
    case 'step-forward': {
      if (engine.active) {
        engine.stop();
      }
      const tickSummary = engine.step();
      res.json({
        success: true,
        action: 'step',
        active: engine.active,
        tick: engine.tick,
        summary: tickSummary,
      });
      return;
    }

    case 'speed':
    case 'set_speed':
    case 'rate': {
      const rateMs = Number(req.body.tickRateMs ?? req.body.speed);
      if (Number.isNaN(rateMs) || rateMs <= 0) {
        res.status(400).json({ success: false, message: 'Invalid tick rate. Expected positive number.' });
        return;
      }
      engine.setTickRate(rateMs);
      res.json({
        success: true,
        action: 'speed',
        tickRateMs: engine.config.tickRateMs,
        active: engine.active,
      });
      return;
    }

    case 'seek': {
      const targetTick = Number(req.body.tick);
      if (Number.isNaN(targetTick) || targetTick < 0) {
        res.status(400).json({ success: false, message: 'Invalid target tick for seek.' });
        return;
      }
      engine.stop();
      const restored = engine.seekToTick(targetTick);
      if (!restored) {
        res.status(404).json({
          success: false,
          message: `Frame for tick #${targetTick} not found in event store`,
        });
        return;
      }
      res.json({
        success: true,
        action: 'seek',
        tick: engine.tick,
        active: engine.active,
      });
      return;
    }

    default:
      res.status(400).json({
        success: false,
        message: `Unknown action '${action}'. Valid actions: play, pause, toggle, step, speed, seek`,
      });
  }
});

/** Spawn a new agent at runtime */
app.post('/api/agents', (req: Request, res: Response): void => {
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
      stamina: 100,
      maxStamina: 100,
    });
    res.json({ success: true, agent: spawned });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to spawn agent';
    res.status(400).json({ success: false, message: msg });
  }
});

/** Clear all obstacles */
app.post('/api/obstacles/clear', (_req: Request, res: Response): void => {
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
app.post('/api/toggle-pause', (_req: Request, res: Response): void => {
  if (engine.active) {
    engine.stop();
    res.json({ success: true, active: false });
  } else {
    engine.start();
    res.json({ success: true, active: true });
  }
});

let server: import('node:http').Server | null = null;
if (process.env['NODE_ENV'] !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`[chronos-sim] Server running at http://localhost:${PORT}`);
  });
}

export { app, engine, eventStore, server };
