import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SimulationEngine } from '../src/core/Engine.js';
import { EventStore } from '../src/storage/EventStore.js';
import { app, engine as serverEngine } from '../src/server/app.js';
import type { SimulationFrame, Threat } from '../src/core/Types.js';

describe('Event-Sourcing & Time-Travel Replay Suite', () => {
  let eventStore: EventStore;
  let engine: SimulationEngine;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Start ephemeral server on random free port for HTTP API testing
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    serverEngine.dispose();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    eventStore = new EventStore({ inMemory: true });
    engine = new SimulationEngine({
      config: {
        gridWidth: 30,
        gridHeight: 30,
        cellSize: 1.0,
        tickRateMs: 50,
        allowDiagonal: true,
        defaultAgentSpeed: 1.0,
        threatEvasionDistance: 5.0,
        rechargeThresholdPercent: 20,
      },
      eventStore,
    });
  });

  afterEach(() => {
    engine.dispose();
    eventStore.close();
  });

  it('stores and retrieves serialized simulation frames with 100% precision', () => {
    const frame: SimulationFrame = {
      tick: 42,
      timestamp: 12345678,
      agents: [
        {
          id: 'Agent-Chronos',
          position: { x: 14.5, y: 15.5 },
          target: { x: 28, y: 28 },
          state: 'NAVIGATING',
          path: [{ x: 15.5, y: 15.5 }, { x: 28, y: 28 }],
          speed: 1.0,
          radius: 0.4,
          stamina: 87.5,
          maxStamina: 100,
          energyBurnRate: 0.5,
          waypoints: [{ x: 28, y: 28 }],
          patrolIndex: 0,
        },
      ],
      obstacles: [{ x: 10, y: 10 }, { x: 11, y: 10 }],
      cellTypes: [
        { x: 5, y: 5, type: 'ROAD' },
        { x: 8, y: 8, type: 'MUD' },
      ],
      threats: [
        {
          id: 'Predator-1',
          position: { x: 20, y: 20 },
          radius: 1.0,
          speed: 0.5,
        },
      ],
      stations: [{ x: 2, y: 2 }],
    };

    eventStore.saveFrame(frame);

    expect(eventStore.getFrameCount()).toBe(1);

    const retrieved = eventStore.getFrame(42);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.tick).toBe(42);
    expect(retrieved?.timestamp).toBe(12345678);
    expect(retrieved?.agents.length).toBe(1);
    expect(retrieved?.agents[0]?.id).toBe('Agent-Chronos');
    expect(retrieved?.agents[0]?.position.x).toBe(14.5);
    expect(retrieved?.agents[0]?.stamina).toBe(87.5);
    expect(retrieved?.obstacles.length).toBe(2);
    expect(retrieved?.cellTypes.length).toBe(2);
    expect(retrieved?.threats.length).toBe(1);
    expect(retrieved?.threats[0]?.id).toBe('Predator-1');
    expect(retrieved?.stations.length).toBe(1);

    // Non-existent frame should return null
    expect(eventStore.getFrame(999)).toBeNull();
  });

  it('records consecutive simulation frames per tick during engine execution', () => {
    engine.spawnAgent({
      id: 'Agent-Runner',
      position: { x: 2, y: 2 },
      target: { x: 20, y: 20 },
      speed: 1.0,
      stamina: 100,
    });

    engine.addObstacle({ x: 5, y: 5 });
    engine.setCellType({ x: 3, y: 3 }, 'MUD');

    const totalTicks = 15;
    for (let i = 0; i < totalTicks; i++) {
      engine.step();
    }

    expect(engine.tick).toBe(totalTicks);
    expect(eventStore.getFrameCount()).toBe(totalTicks);

    // Verify history range query
    const range = eventStore.getHistoryRange(5, 10);
    expect(range.length).toBe(6);
    expect(range[0]?.tick).toBe(5);
    expect(range[range.length - 1]?.tick).toBe(10);

    // Verify progression of agent position over time
    const frame1 = eventStore.getFrame(1);
    const frame10 = eventStore.getFrame(10);
    expect(frame1).not.toBeNull();
    expect(frame10).not.toBeNull();
    expect(frame10!.agents[0]!.position.x).toBeGreaterThan(frame1!.agents[0]!.position.x);
  });

  it('performs deterministic time-travel replay via seekToTick()', () => {
    engine.spawnAgent({
      id: 'Agent-TimeTraveler',
      position: { x: 2, y: 2 },
      target: { x: 10, y: 2 },
      speed: 1.0,
      stamina: 100,
    });

    const threat: Threat = {
      id: 'Threat-Stalker',
      position: { x: 15, y: 15 },
      radius: 1.0,
      speed: 0.2,
    };
    engine.addThreat(threat);

    // Run 10 ticks and snapshot checkpoints
    for (let i = 0; i < 10; i++) {
      engine.step();
    }

    const frameAt5 = eventStore.getFrame(5);
    expect(frameAt5).not.toBeNull();
    const posAt5 = frameAt5!.agents[0]!.position;
    const staminaAt5 = frameAt5!.agents[0]!.stamina;

    // Continue to tick 20
    for (let i = 0; i < 10; i++) {
      engine.step();
    }
    expect(engine.tick).toBe(20);

    // Time-travel backwards to tick 5
    const seekSuccess = engine.seekToTick(5);
    expect(seekSuccess).toBe(true);
    expect(engine.tick).toBe(5);

    const restoredAgent = engine.getAgent('Agent-TimeTraveler');
    expect(restoredAgent).not.toBeUndefined();
    expect(restoredAgent!.position.x).toBe(posAt5.x);
    expect(restoredAgent!.position.y).toBe(posAt5.y);
    expect(restoredAgent!.stamina).toBe(staminaAt5);

    // Step forward from restored tick 5 to tick 6
    engine.step();
    expect(engine.tick).toBe(6);

    const frameAt6 = eventStore.getFrame(6);
    const agentAt6 = engine.getAgent('Agent-TimeTraveler');
    expect(agentAt6!.position.x).toBe(frameAt6!.agents[0]!.position.x);
    expect(agentAt6!.position.y).toBe(frameAt6!.agents[0]!.position.y);
  });

  describe('REST API Time-Travel & Control Endpoints', () => {
    it('handles POST /api/terrain for setting different cell types and obstacle triggers', async () => {
      // 1. Set Mud
      const mudRes = await fetch(`${baseUrl}/api/terrain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 10, y: 12, type: 'MUD' }),
      });
      const mudBody = await mudRes.json() as { success: boolean; type: string; cost: number };
      expect(mudRes.status).toBe(200);
      expect(mudBody.success).toBe(true);
      expect(mudBody.type).toBe('MUD');
      expect(mudBody.cost).toBe(5.0);

      // 2. Set Wall
      const wallRes = await fetch(`${baseUrl}/api/terrain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 15, y: 15, type: 'WALL' }),
      });
      const wallBody = await wallRes.json() as { success: boolean; type: string };
      expect(wallRes.status).toBe(200);
      expect(wallBody.success).toBe(true);
      expect(wallBody.type).toBe('WALL');

      // 3. Set Station
      const stationRes = await fetch(`${baseUrl}/api/terrain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 20, y: 20, type: 'STATION' }),
      });
      const stationBody = await stationRes.json() as { success: boolean; type: string };
      expect(stationRes.status).toBe(200);
      expect(stationBody.success).toBe(true);
      expect(stationBody.type).toBe('STATION');

      // 4. Invalid terrain type returns 400
      const invalidRes = await fetch(`${baseUrl}/api/terrain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: 5, y: 5, type: 'LAVA' }),
      });
      const invalidBody = await invalidRes.json() as { success: boolean };
      expect(invalidRes.status).toBe(400);
      expect(invalidBody.success).toBe(false);
    });

    it('handles POST /api/spawn-threat to create moving threats', async () => {
      const res = await fetch(`${baseUrl}/api/spawn-threat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'Predator-Alpha', x: 22, y: 18, speed: 0.4, radius: 1.2 }),
      });
      const body = await res.json() as { success: boolean; threat: Threat };
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.threat.id).toBe('Predator-Alpha');
      expect(body.threat.position.x).toBe(22);
      expect(body.threat.position.y).toBe(18);
    });

    it('handles POST /api/control for Pause, Play, Step, Speed and Seek', async () => {
      // 1. Pause
      const pauseRes = await fetch(`${baseUrl}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      });
      const pauseBody = await pauseRes.json() as { success: boolean; action: string; active: boolean };
      expect(pauseRes.status).toBe(200);
      expect(pauseBody.action).toBe('pause');
      expect(pauseBody.active).toBe(false);

      // 2. Step forward
      const currentTickRes = await fetch(`${baseUrl}/api/state`);
      const stateBefore = await currentTickRes.json() as { tick: number };
      const startTick = stateBefore.tick;

      const stepRes = await fetch(`${baseUrl}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'step' }),
      });
      const stepBody = await stepRes.json() as { success: boolean; action: string; tick: number };
      expect(stepRes.status).toBe(200);
      expect(stepBody.action).toBe('step');
      expect(stepBody.tick).toBe(startTick + 1);

      // 3. Speed adjustment
      const speedRes = await fetch(`${baseUrl}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'speed', tickRateMs: 30 }),
      });
      const speedBody = await speedRes.json() as { success: boolean; tickRateMs: number };
      expect(speedRes.status).toBe(200);
      expect(speedBody.tickRateMs).toBe(30);

      // 4. Play
      const playRes = await fetch(`${baseUrl}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'play' }),
      });
      const playBody = await playRes.json() as { success: boolean; active: boolean };
      expect(playRes.status).toBe(200);
      expect(playBody.active).toBe(true);

      // Pause again for stability
      await fetch(`${baseUrl}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      });
    });

    it('handles GET /api/replay/:tick and GET /api/replay/range', async () => {
      // Run several steps to generate recorded frames
      for (let i = 0; i < 5; i++) {
        await fetch(`${baseUrl}/api/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'step' }),
        });
      }

      const stateRes = await fetch(`${baseUrl}/api/state`);
      const stateBody = await stateRes.json() as { tick: number };
      const targetTick = stateBody.tick;

      // GET historical replay frame
      const replayRes = await fetch(`${baseUrl}/api/replay/${targetTick}`);
      const replayBody = await replayRes.json() as { success: boolean; tick: number; frame?: SimulationFrame };
      expect(replayRes.status).toBe(200);
      expect(replayBody.success).toBe(true);
      expect(replayBody.tick).toBe(targetTick);
      expect(replayBody.frame).not.toBeUndefined();
      expect(replayBody.frame?.tick).toBe(targetTick);

      // Replay non-existent future tick
      const notFoundRes = await fetch(`${baseUrl}/api/replay/999999`);
      const notFoundBody = await notFoundRes.json() as { success: boolean };
      expect(notFoundRes.status).toBe(404);
      expect(notFoundBody.success).toBe(false);

      // GET replay range
      const rangeRes = await fetch(`${baseUrl}/api/replay/range?from=1&to=5`);
      const rangeBody = await rangeRes.json() as { success: boolean; frames: SimulationFrame[] };
      expect(rangeRes.status).toBe(200);
      expect(rangeBody.success).toBe(true);
      expect(Array.isArray(rangeBody.frames)).toBe(true);
    });
  });
});
