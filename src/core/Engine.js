import { CELL_COST, DEFAULT_SIMULATION_CONFIG, createVector, vectorDistance, vectorEquals, vectorLerp, } from './Types.js';
import { SpatialGrid } from '../spatial/SpatialGrid.js';
import { AStarPathfinder } from '../spatial/Pathfinding.js';
import { AgentStateMachine } from '../fsm/StateMachine.js';
import { AgentBehavior } from '../fsm/AgentBehavior.js';
/**
 * Deterministic Advanced Simulation Engine (Chronos Engine).
 * Orchestrates spatial hash indexing, terrain-cost A* pathfinding,
 * finite state machines, dynamic predator evasion, stamina management,
 * and charging station cycles.
 */
export class SimulationEngine {
    config;
    spatialGrid;
    pathfinder;
    currentTick = 0;
    isRunning = false;
    timerHandle = null;
    eventStore = null;
    /** Registered agents map: agentId -> mutable state record */
    agents = new Map();
    /** Agent state machines map: agentId -> FSM */
    fsms = new Map();
    /** Threats (Predators) in the environment */
    threats = new Map();
    /** Event listeners */
    eventListeners = new Set();
    tickListeners = new Set();
    constructor(options) {
        this.config = {
            ...DEFAULT_SIMULATION_CONFIG,
            ...(options?.config ?? {}),
        };
        this.eventStore = options?.eventStore ?? null;
        this.spatialGrid = new SpatialGrid({
            width: this.config.gridWidth,
            height: this.config.gridHeight,
            cellSize: this.config.cellSize,
        });
        this.pathfinder = new AStarPathfinder(this.spatialGrid, {
            allowDiagonal: this.config.allowDiagonal,
            diagonalCost: this.config.diagonalCostMultiplier,
            cardinalCost: 1.0,
            preventCornerCutting: true,
            maxIterations: this.config.maxAStarIterations,
        });
    }
    // --- Public State Getters ---
    get tick() {
        return this.currentTick;
    }
    get active() {
        return this.isRunning;
    }
    getAgent(id) {
        return this.agents.get(id);
    }
    getAllAgents() {
        return Array.from(this.agents.values());
    }
    getAgentState(id) {
        return this.fsms.get(id)?.state;
    }
    // --- Event Subscription ---
    /** Subscribes to all discrete simulation events */
    subscribe(listener) {
        this.eventListeners.add(listener);
        return () => {
            this.eventListeners.delete(listener);
        };
    }
    /** Subscribes to tick completion summaries */
    onTick(listener) {
        this.tickListeners.add(listener);
        return () => {
            this.tickListeners.delete(listener);
        };
    }
    /** Subscribes to a specific simulation event type */
    on(type, listener) {
        const callback = (event) => {
            if (event.type === type) {
                listener(event);
            }
        };
        return this.subscribe(callback);
    }
    // --- Threat (Predator) Management ---
    addThreat(threat) {
        this.threats.set(threat.id, threat);
        const event = {
            type: 'THREAT_SPAWNED',
            tick: this.currentTick,
            timestamp: Date.now(),
            threat,
        };
        this.emitEvent(event);
    }
    removeThreat(threatId) {
        const existed = this.threats.delete(threatId);
        if (existed) {
            const event = {
                type: 'THREAT_REMOVED',
                tick: this.currentTick,
                timestamp: Date.now(),
                threatId,
            };
            this.emitEvent(event);
            return true;
        }
        return false;
    }
    getThreat(threatId) {
        return this.threats.get(threatId);
    }
    getAllThreats() {
        return Array.from(this.threats.values());
    }
    updateThreatPosition(threatId, position) {
        const threat = this.threats.get(threatId);
        if (!threat)
            return false;
        this.threats.set(threatId, { ...threat, position: createVector(position.x, position.y) });
        return true;
    }
    // --- Charging Station & Terrain Management ---
    addStation(position) {
        this.spatialGrid.addStation(position);
        this.emitEvent({
            type: 'CELL_TYPE_CHANGED',
            tick: this.currentTick,
            timestamp: Date.now(),
            position: createVector(position.x, position.y),
            cellType: 'STATION',
            cost: CELL_COST['STATION'],
        });
    }
    removeStation(position) {
        const removed = this.spatialGrid.removeStation(position);
        if (removed) {
            this.emitEvent({
                type: 'CELL_TYPE_CHANGED',
                tick: this.currentTick,
                timestamp: Date.now(),
                position: createVector(position.x, position.y),
                cellType: 'EMPTY',
                cost: CELL_COST['EMPTY'],
            });
            return true;
        }
        return false;
    }
    getAllStations() {
        return this.spatialGrid.getStations();
    }
    findNearestStation(position) {
        return this.spatialGrid.findNearestStation(position);
    }
    setCellType(position, type) {
        const { cx, cy } = this.spatialGrid.worldToCell(position);
        this.spatialGrid.setCellType(cx, cy, type);
        if (type === 'WALL') {
            this.spatialGrid.addObstacle(position);
            // Reroute agents if current path crosses this newly created wall
            for (const agent of this.getAllAgents()) {
                if ((agent.state === 'NAVIGATING' || agent.state === 'PATROL') && agent.target) {
                    const hits = agent.path.some((p) => Math.floor(p.x) === cx && Math.floor(p.y) === cy);
                    if (hits) {
                        this.setAgentTarget(agent.id, agent.target);
                    }
                }
            }
        }
        else if (this.spatialGrid.hasObstacle(position)) {
            this.spatialGrid.removeObstacle(position);
            // Unblock agents if this was an obstacle preventing their path
            for (const agent of this.getAllAgents()) {
                if (agent.state === 'BLOCKED' && agent.target) {
                    this.setAgentTarget(agent.id, agent.target);
                }
            }
        }
        this.emitEvent({
            type: 'CELL_TYPE_CHANGED',
            tick: this.currentTick,
            timestamp: Date.now(),
            position: createVector(position.x, position.y),
            cellType: type,
            cost: CELL_COST[type],
        });
    }
    getCellType(position) {
        const { cx, cy } = this.spatialGrid.worldToCell(position);
        return this.spatialGrid.getCellType(cx, cy);
    }
    getCellCost(position) {
        const { cx, cy } = this.spatialGrid.worldToCell(position);
        return this.spatialGrid.getCellCost(cx, cy);
    }
    // --- Agent & Patrol Mutators ---
    /**
     * Spawns a new agent into the simulation with stamina and waypoints.
     */
    spawnAgent(options) {
        if (this.agents.has(options.id)) {
            throw new Error(`Agent with id '${options.id}' already exists.`);
        }
        if (!this.spatialGrid.isInBounds(options.position)) {
            throw new Error(`Spawn position (${options.position.x}, ${options.position.y}) is out of bounds.`);
        }
        const initialState = options.state ?? 'IDLE';
        const fsm = new AgentStateMachine(options.id, initialState);
        this.fsms.set(options.id, fsm);
        const maxStamina = options.maxStamina ?? this.config.defaultMaxStamina ?? 100;
        const stamina = options.stamina ?? maxStamina;
        const energyBurnRate = options.energyBurnRate ?? this.config.defaultEnergyBurnRate ?? 0.5;
        const waypoints = options.waypoints ? [...options.waypoints] : [];
        const agent = {
            id: options.id,
            position: createVector(options.position.x, options.position.y),
            target: null,
            state: initialState,
            path: [],
            speed: options.speed ?? this.config.defaultAgentSpeed,
            radius: options.radius ?? this.config.cellSize * 0.4,
            stamina,
            maxStamina,
            energyBurnRate,
            waypoints,
            patrolIndex: 0,
        };
        this.agents.set(agent.id, agent);
        this.spatialGrid.insertAgent(agent);
        const spawnEvent = {
            type: 'AGENT_SPAWNED',
            tick: this.currentTick,
            timestamp: Date.now(),
            agent,
        };
        this.emitEvent(spawnEvent);
        // Initial patrol or target routing
        if (waypoints.length > 0) {
            this.setAgentPatrol(agent.id, waypoints);
        }
        else if (options.target) {
            this.setAgentTarget(agent.id, options.target);
        }
        return this.agents.get(agent.id) ?? agent;
    }
    /**
     * Configures patrol waypoints for an agent.
     */
    setAgentPatrol(agentId, waypoints) {
        const agent = this.agents.get(agentId);
        const fsm = this.fsms.get(agentId);
        if (!agent || !fsm || waypoints.length === 0) {
            return false;
        }
        const firstWaypoint = waypoints[0];
        if (!firstWaypoint)
            return false;
        const computedPath = this.pathfinder.findPath(agent.position, firstWaypoint);
        fsm.startPatrol('Starting patrol route');
        const updated = {
            ...agent,
            waypoints: [...waypoints],
            patrolIndex: 0,
            target: createVector(firstWaypoint.x, firstWaypoint.y),
            state: fsm.state,
            path: computedPath,
        };
        this.agents.set(agentId, updated);
        this.spatialGrid.updateAgent(updated);
        this.emitEvent({
            type: 'AGENT_STATE_CHANGED',
            tick: this.currentTick,
            timestamp: Date.now(),
            agentId,
            previousState: agent.state,
            newState: fsm.state,
            reason: 'Patrol started',
        });
        if (computedPath.length > 0) {
            this.emitEvent({
                type: 'PATH_CALCULATED',
                tick: this.currentTick,
                timestamp: Date.now(),
                agentId,
                from: agent.position,
                to: firstWaypoint,
                path: computedPath,
                pathLength: computedPath.length,
            });
        }
        return true;
    }
    /**
     * Removes an agent from the simulation.
     */
    despawnAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            return false;
        }
        this.spatialGrid.removeAgent(agentId);
        this.agents.delete(agentId);
        this.fsms.delete(agentId);
        const despawnEvent = {
            type: 'AGENT_DESPAWNED',
            tick: this.currentTick,
            timestamp: Date.now(),
            agentId,
        };
        this.emitEvent(despawnEvent);
        return true;
    }
    /**
     * Assigns a destination target to an agent and triggers path calculation.
     */
    setAgentTarget(agentId, target) {
        const agent = this.agents.get(agentId);
        const fsm = this.fsms.get(agentId);
        if (!agent || !fsm) {
            return false;
        }
        const computedPath = this.pathfinder.findPath(agent.position, target);
        if (computedPath.length === 0) {
            const previousState = fsm.state;
            fsm.block('No valid path to target');
            const updatedAgent = {
                ...agent,
                target: createVector(target.x, target.y),
                state: fsm.state,
                path: [],
            };
            this.agents.set(agentId, updatedAgent);
            this.spatialGrid.updateAgent(updatedAgent);
            if (previousState !== fsm.state) {
                this.emitEvent({
                    type: 'AGENT_STATE_CHANGED',
                    tick: this.currentTick,
                    timestamp: Date.now(),
                    agentId,
                    previousState,
                    newState: fsm.state,
                    reason: 'Path unreachable',
                });
            }
            this.emitEvent({
                type: 'AGENT_BLOCKED',
                tick: this.currentTick,
                timestamp: Date.now(),
                agentId,
                position: agent.position,
                target,
                reason: 'Target is unreachable or blocked',
            });
            return false;
        }
        const previousState = fsm.state;
        fsm.startNavigation('New target set with valid path');
        const updatedAgent = {
            ...agent,
            target: createVector(target.x, target.y),
            state: fsm.state,
            path: computedPath,
        };
        this.agents.set(agentId, updatedAgent);
        this.spatialGrid.updateAgent(updatedAgent);
        this.emitEvent({
            type: 'PATH_CALCULATED',
            tick: this.currentTick,
            timestamp: Date.now(),
            agentId,
            from: agent.position,
            to: target,
            path: computedPath,
            pathLength: computedPath.length,
        });
        if (previousState !== fsm.state) {
            this.emitEvent({
                type: 'AGENT_STATE_CHANGED',
                tick: this.currentTick,
                timestamp: Date.now(),
                agentId,
                previousState,
                newState: fsm.state,
                reason: 'Navigation started',
            });
        }
        return true;
    }
    /**
     * Adds a dynamic obstacle at the specified position.
     */
    addObstacle(position) {
        const added = this.spatialGrid.addObstacle(position);
        if (!added) {
            return false;
        }
        const event = {
            type: 'OBSTACLE_ADDED',
            tick: this.currentTick,
            timestamp: Date.now(),
            position: createVector(position.x, position.y),
        };
        this.emitEvent(event);
        return true;
    }
    /**
     * Removes a dynamic obstacle.
     */
    removeObstacle(position) {
        const removed = this.spatialGrid.removeObstacle(position);
        if (!removed) {
            return false;
        }
        const event = {
            type: 'OBSTACLE_REMOVED',
            tick: this.currentTick,
            timestamp: Date.now(),
            position: createVector(position.x, position.y),
        };
        this.emitEvent(event);
        return true;
    }
    // --- Deterministic Step Execution ---
    /**
     * Executes a single fixed simulation tick deterministically.
     * Updates threats, manages stamina, handles predator evasion,
     * routes to charging stations, and advances agents along paths.
     */
    step() {
        this.currentTick++;
        const tickStart = Date.now();
        const tickEvents = [];
        const tickEmitter = (event) => {
            tickEvents.push(event);
            for (const listener of this.eventListeners) {
                listener(event);
            }
        };
        // Deterministic agent processing order
        const sortedAgentIds = Array.from(this.agents.keys()).sort();
        for (const agentId of sortedAgentIds) {
            const agent = this.agents.get(agentId);
            const fsm = this.fsms.get(agentId);
            if (!agent || !fsm) {
                continue;
            }
            this.updateAgentStep(agent, fsm, tickEmitter);
        }
        // Periodic state snapshots
        if (this.currentTick % this.config.snapshotIntervalTicks === 0) {
            const snapshot = this.getSnapshot();
            if (this.eventStore) {
                this.eventStore.saveSnapshot(snapshot);
            }
            const snapshotEvent = {
                type: 'SNAPSHOT_CREATED',
                tick: this.currentTick,
                timestamp: tickStart,
                agentCount: snapshot.agents.length,
                obstacleCount: snapshot.obstacles.length,
            };
            tickEmitter(snapshotEvent);
        }
        // Persist events to EventStore
        if (this.eventStore && tickEvents.length > 0) {
            this.eventStore.appendEvents(tickEvents);
        }
        // Persist complete per-tick frame to EventStore for Time-Travel Replay
        if (this.eventStore) {
            const frame = {
                tick: this.currentTick,
                timestamp: tickStart,
                agents: Array.from(this.agents.values()).map((a) => ({
                    ...a,
                    position: createVector(a.position.x, a.position.y),
                    target: a.target ? createVector(a.target.x, a.target.y) : null,
                    path: a.path.map((p) => createVector(p.x, p.y)),
                    waypoints: a.waypoints.map((w) => createVector(w.x, w.y)),
                })),
                obstacles: this.spatialGrid.getAllObstacles().map((o) => createVector(o.x, o.y)),
                cellTypes: this.spatialGrid.getAllCellTypes(),
                threats: Array.from(this.threats.values()).map((t) => ({
                    ...t,
                    position: createVector(t.position.x, t.position.y),
                })),
                stations: this.spatialGrid.getStations().map((s) => createVector(s.x, s.y)),
            };
            this.eventStore.saveFrame(frame);
        }
        const tickSummary = {
            tick: this.currentTick,
            timestamp: tickStart,
            deltaMs: this.config.tickRateMs,
            activeAgents: this.agents.size,
            events: tickEvents,
        };
        for (const tickListener of this.tickListeners) {
            tickListener(tickSummary);
        }
        return tickSummary;
    }
    /**
     * Updates a single agent during the simulation tick:
     * 1. Evaluates predator threat proximity (< 5.0 units) -> triggers EVADING state and escape vector.
     * 2. Checks stamina (< 20%) -> prioritizes routing to nearest STATION cell.
     * 3. Executes recharging if on station cell.
     * 4. Updates patrol waypoint cycling or normal navigation.
     * 5. Burns stamina based on terrain movement cost.
     */
    updateAgentStep(agent, fsm, emit) {
        // 0. Check for exhaustion
        if (agent.stamina <= 0 && fsm.state !== 'EXHAUSTED') {
            const prevState = fsm.state;
            fsm.exhaust('Stamina depleted to zero');
            const exhaustedAgent = { ...agent, state: fsm.state, path: [] };
            this.agents.set(agent.id, exhaustedAgent);
            this.spatialGrid.updateAgent(exhaustedAgent);
            emit({
                type: 'AGENT_EXHAUSTED',
                tick: this.currentTick,
                timestamp: Date.now(),
                agentId: agent.id,
                position: agent.position,
            });
            emit({
                type: 'AGENT_STATE_CHANGED',
                tick: this.currentTick,
                timestamp: Date.now(),
                agentId: agent.id,
                previousState: prevState,
                newState: 'EXHAUSTED',
                reason: 'Stamina fully depleted',
            });
            return;
        }
        if (fsm.state === 'EXHAUSTED') {
            return; // Agent is immobilized until recharged
        }
        // 1. Threat Proximity Check (Predator within 5.0 units)
        const evasionDistanceThreshold = this.config.threatEvasionDistance ?? 5.0;
        const evasion = AgentBehavior.evaluateThreatEvasion(agent.position, this.getAllThreats(), this.spatialGrid, evasionDistanceThreshold);
        if (evasion.shouldEvade && evasion.threat && evasion.evasionTarget) {
            const prevState = fsm.state;
            fsm.evadeThreat(`Predator ${evasion.threat.id} within 5.0 units`);
            const evasionPath = this.pathfinder.findPath(agent.position, evasion.evasionTarget);
            const evadingAgent = {
                ...agent,
                state: fsm.state,
                target: evasion.evasionTarget,
                path: evasionPath.length > 0 ? evasionPath : [evasion.evasionTarget],
            };
            this.agents.set(agent.id, evadingAgent);
            this.spatialGrid.updateAgent(evadingAgent);
            agent = evadingAgent;
            emit({
                type: 'AGENT_EVADING',
                tick: this.currentTick,
                timestamp: Date.now(),
                agentId: agent.id,
                threatId: evasion.threat.id,
                threatPosition: evasion.threat.position,
                evasionVector: evasion.evasionTarget,
            });
            if (prevState !== 'EVADING') {
                emit({
                    type: 'AGENT_STATE_CHANGED',
                    tick: this.currentTick,
                    timestamp: Date.now(),
                    agentId: agent.id,
                    previousState: prevState,
                    newState: 'EVADING',
                    reason: 'Threat evasion triggered',
                });
            }
        }
        // 2. Low Stamina (< 20%) & Charging Station Seek
        const isLowStamina = AgentBehavior.isLowStamina(agent, this.config.rechargeThresholdPercent ?? 20);
        if (fsm.state === 'RECHARGING') {
            const currentCell = this.spatialGrid.worldToCell(agent.position);
            const isAtStation = this.spatialGrid.getCellType(currentCell.cx, currentCell.cy) === 'STATION';
            if (isAtStation) {
                // Recharge stamina
                const rechargedStamina = AgentBehavior.rechargeStamina(agent.stamina, agent.maxStamina, 10.0);
                const rechargedAgent = { ...agent, stamina: rechargedStamina };
                this.agents.set(agent.id, rechargedAgent);
                agent = rechargedAgent;
                emit({
                    type: 'AGENT_RECHARGING',
                    tick: this.currentTick,
                    timestamp: Date.now(),
                    agentId: agent.id,
                    stationPosition: agent.position,
                    currentStamina: rechargedStamina,
                });
                if (rechargedStamina >= agent.maxStamina) {
                    // Fully recharged! Resume previous mission
                    if (agent.waypoints.length > 0) {
                        fsm.startPatrol('Recharge complete, resuming patrol');
                        const targetWp = agent.waypoints[agent.patrolIndex ?? 0] ?? agent.waypoints[0];
                        const resumePath = this.pathfinder.findPath(agent.position, targetWp);
                        const resumedAgent = {
                            ...agent,
                            state: fsm.state,
                            target: targetWp,
                            path: resumePath,
                        };
                        this.agents.set(agent.id, resumedAgent);
                        this.spatialGrid.updateAgent(resumedAgent);
                    }
                    else {
                        fsm.rechargeComplete('Recharge complete');
                        const idleAgent = { ...agent, state: fsm.state, path: [] };
                        this.agents.set(agent.id, idleAgent);
                        this.spatialGrid.updateAgent(idleAgent);
                    }
                    emit({
                        type: 'AGENT_STATE_CHANGED',
                        tick: this.currentTick,
                        timestamp: Date.now(),
                        agentId: agent.id,
                        previousState: 'RECHARGING',
                        newState: fsm.state,
                        reason: 'Recharge complete (100%)',
                    });
                    return;
                }
                return; // Stay at station while actively recharging
            }
        }
        else if (isLowStamina && fsm.state !== 'EVADING') {
            // Divert to nearest station
            const nearestStation = this.findNearestStation(agent.position);
            if (nearestStation) {
                const prevState = fsm.state;
                fsm.seekRecharge('Low stamina (<20%), seeking station');
                const stationPath = this.pathfinder.findPath(agent.position, nearestStation);
                const seekingAgent = {
                    ...agent,
                    state: fsm.state,
                    target: nearestStation,
                    path: stationPath,
                };
                this.agents.set(agent.id, seekingAgent);
                this.spatialGrid.updateAgent(seekingAgent);
                agent = seekingAgent;
                emit({
                    type: 'AGENT_STATE_CHANGED',
                    tick: this.currentTick,
                    timestamp: Date.now(),
                    agentId: agent.id,
                    previousState: prevState,
                    newState: 'RECHARGING',
                    reason: 'Low stamina (<20%), routing to station',
                });
            }
        }
        // 3. Blocked state handling
        if (fsm.state === 'BLOCKED' && agent.target) {
            const newPath = this.pathfinder.findPath(agent.position, agent.target);
            if (newPath.length > 0) {
                fsm.resolvePath('Alternative path found');
                const updated = {
                    ...agent,
                    state: fsm.state,
                    path: newPath,
                };
                this.agents.set(agent.id, updated);
                this.spatialGrid.updateAgent(updated);
                emit({
                    type: 'PATH_CALCULATED',
                    tick: this.currentTick,
                    timestamp: Date.now(),
                    agentId: agent.id,
                    from: agent.position,
                    to: agent.target,
                    path: newPath,
                    pathLength: newPath.length,
                });
                emit({
                    type: 'AGENT_STATE_CHANGED',
                    tick: this.currentTick,
                    timestamp: Date.now(),
                    agentId: agent.id,
                    previousState: 'BLOCKED',
                    newState: fsm.state,
                    reason: 'Path unblocked',
                });
                return;
            }
            return;
        }
        // 4. Movement Execution for moving states (NAVIGATING, PATROL, EVADING, RECHARGING)
        const isMovingState = fsm.state === 'NAVIGATING' ||
            fsm.state === 'PATROL' ||
            fsm.state === 'EVADING' ||
            fsm.state === 'RECHARGING';
        if (!isMovingState || agent.path.length === 0 || !agent.target) {
            return;
        }
        const nextWaypoint = agent.path[0];
        if (!nextWaypoint)
            return;
        // Check if next waypoint has become blocked
        if (this.spatialGrid.hasObstacle(nextWaypoint)) {
            const recalculated = this.pathfinder.findPath(agent.position, agent.target);
            if (recalculated.length === 0) {
                fsm.block('Waypoint occupied by obstacle, no detour found');
                const blockedAgent = {
                    ...agent,
                    state: fsm.state,
                    path: [],
                };
                this.agents.set(agent.id, blockedAgent);
                this.spatialGrid.updateAgent(blockedAgent);
                emit({
                    type: 'AGENT_BLOCKED',
                    tick: this.currentTick,
                    timestamp: Date.now(),
                    agentId: agent.id,
                    position: agent.position,
                    target: agent.target,
                    reason: 'Waypoint blocked by obstacle',
                });
                return;
            }
            const detourAgent = {
                ...agent,
                path: recalculated,
            };
            this.agents.set(agent.id, detourAgent);
            agent = detourAgent;
        }
        const currentWaypoint = agent.path[0];
        if (!currentWaypoint)
            return;
        const dist = vectorDistance(agent.position, currentWaypoint);
        const stepDist = agent.speed;
        // Determine terrain cost at target coordinate
        const targetCell = this.spatialGrid.worldToCell(currentWaypoint);
        const terrainCost = this.spatialGrid.getCellCost(targetCell.cx, targetCell.cy);
        // Calculate energy burn (MUD = 5x, ROAD = 0.5x, EVADING = 1.5x)
        const energyBurn = AgentBehavior.calculateEnergyBurn(agent.energyBurnRate, terrainCost, fsm.state === 'EVADING');
        const updatedStamina = AgentBehavior.burnStamina(agent.stamina, energyBurn);
        if (dist <= stepDist || vectorEquals(agent.position, currentWaypoint, 1e-4)) {
            // Reached current waypoint
            const previousPos = agent.position;
            const newPos = createVector(currentWaypoint.x, currentWaypoint.y);
            const remainingPath = agent.path.slice(1);
            emit({
                type: 'AGENT_MOVED',
                tick: this.currentTick,
                timestamp: Date.now(),
                agentId: agent.id,
                from: previousPos,
                to: newPos,
                stamina: updatedStamina,
            });
            if (remainingPath.length === 0) {
                // Final destination of current trajectory reached
                if (fsm.state === 'PATROL' && agent.waypoints.length > 0) {
                    // Advance to next patrol waypoint
                    const nextIndex = ((agent.patrolIndex ?? 0) + 1) % agent.waypoints.length;
                    const nextWp = agent.waypoints[nextIndex];
                    const nextPath = this.pathfinder.findPath(newPos, nextWp);
                    const patrollingAgent = {
                        ...agent,
                        position: newPos,
                        stamina: updatedStamina,
                        patrolIndex: nextIndex,
                        target: nextWp,
                        path: nextPath,
                    };
                    this.agents.set(agent.id, patrollingAgent);
                    this.spatialGrid.updateAgent(patrollingAgent);
                }
                else if (fsm.state === 'EVADING') {
                    // Evasion step completed, check if still threatened
                    const evadingCompletedAgent = {
                        ...agent,
                        position: newPos,
                        stamina: updatedStamina,
                        path: [],
                    };
                    this.agents.set(agent.id, evadingCompletedAgent);
                    this.spatialGrid.updateAgent(evadingCompletedAgent);
                }
                else if (fsm.state === 'RECHARGING') {
                    // Arrived at charging station
                    const atStationAgent = {
                        ...agent,
                        position: newPos,
                        stamina: updatedStamina,
                        path: [],
                    };
                    this.agents.set(agent.id, atStationAgent);
                    this.spatialGrid.updateAgent(atStationAgent);
                }
                else {
                    // Target reached for general NAVIGATING
                    fsm.reachTarget('Agent reached final target waypoint');
                    const completedAgent = {
                        ...agent,
                        position: newPos,
                        stamina: updatedStamina,
                        state: fsm.state,
                        path: [],
                    };
                    this.agents.set(agent.id, completedAgent);
                    this.spatialGrid.updateAgent(completedAgent);
                    emit({
                        type: 'AGENT_REACHED_TARGET',
                        tick: this.currentTick,
                        timestamp: Date.now(),
                        agentId: agent.id,
                        target: newPos,
                    });
                    emit({
                        type: 'AGENT_STATE_CHANGED',
                        tick: this.currentTick,
                        timestamp: Date.now(),
                        agentId: agent.id,
                        previousState: 'NAVIGATING',
                        newState: fsm.state,
                        reason: 'Destination reached',
                    });
                }
            }
            else {
                // Advance along path
                const advancedAgent = {
                    ...agent,
                    position: newPos,
                    stamina: updatedStamina,
                    path: remainingPath,
                };
                this.agents.set(agent.id, advancedAgent);
                this.spatialGrid.updateAgent(advancedAgent);
            }
        }
        else {
            // Partial step
            const previousPos = agent.position;
            const newPos = vectorLerp(agent.position, currentWaypoint, stepDist / dist);
            const movedAgent = {
                ...agent,
                position: newPos,
                stamina: updatedStamina,
            };
            this.agents.set(agent.id, movedAgent);
            this.spatialGrid.updateAgent(movedAgent);
            emit({
                type: 'AGENT_MOVED',
                tick: this.currentTick,
                timestamp: Date.now(),
                agentId: agent.id,
                from: previousPos,
                to: newPos,
                stamina: updatedStamina,
            });
        }
    }
    /** Emits an event immediately to subscribers and EventStore */
    emitEvent(event) {
        if (this.eventStore) {
            this.eventStore.appendEvent(event);
        }
        for (const listener of this.eventListeners) {
            listener(event);
        }
    }
    // --- Simulation Loop Control ---
    start() {
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        const startedEvent = {
            type: 'SIMULATION_STARTED',
            tick: this.currentTick,
            timestamp: Date.now(),
            config: this.config,
        };
        this.emitEvent(startedEvent);
        this.timerHandle = setInterval(() => {
            this.step();
        }, this.config.tickRateMs);
    }
    stop() {
        if (!this.isRunning) {
            return;
        }
        if (this.timerHandle) {
            clearInterval(this.timerHandle);
            this.timerHandle = null;
        }
        this.isRunning = false;
        const stoppedEvent = {
            type: 'SIMULATION_STOPPED',
            tick: this.currentTick,
            timestamp: Date.now(),
        };
        this.emitEvent(stoppedEvent);
    }
    /**
     * Dynamically adjusts the tick rate / simulation speed in milliseconds.
     */
    setTickRate(tickRateMs) {
        const clampedRate = Math.max(10, Math.min(2000, tickRateMs));
        this.config = {
            ...this.config,
            tickRateMs: clampedRate,
        };
        if (this.isRunning) {
            if (this.timerHandle) {
                clearInterval(this.timerHandle);
            }
            this.timerHandle = setInterval(() => {
                this.step();
            }, this.config.tickRateMs);
        }
    }
    // --- Time-Travel Replay & Snapshot Restoration ---
    /**
     * Captures the current complete simulation frame for state preservation.
     */
    getCurrentFrame() {
        return {
            tick: this.currentTick,
            timestamp: Date.now(),
            agents: Array.from(this.agents.values()).map((a) => ({
                ...a,
                position: createVector(a.position.x, a.position.y),
                target: a.target ? createVector(a.target.x, a.target.y) : null,
                path: a.path.map((p) => createVector(p.x, p.y)),
                waypoints: a.waypoints.map((w) => createVector(w.x, w.y)),
            })),
            obstacles: this.spatialGrid.getAllObstacles().map((o) => createVector(o.x, o.y)),
            cellTypes: this.spatialGrid.getAllCellTypes(),
            threats: Array.from(this.threats.values()).map((t) => ({
                ...t,
                position: createVector(t.position.x, t.position.y),
            })),
            stations: this.spatialGrid.getStations().map((s) => createVector(s.x, s.y)),
        };
    }
    /**
     * Restores the exact simulation state from a serialized SimulationFrame.
     */
    restoreFromFrame(frame) {
        this.currentTick = frame.tick;
        this.spatialGrid.clear();
        this.agents.clear();
        this.fsms.clear();
        this.threats.clear();
        for (const ct of frame.cellTypes) {
            this.spatialGrid.setCellType(ct.x, ct.y, ct.type);
        }
        for (const obstacle of frame.obstacles) {
            this.spatialGrid.addObstacle(obstacle);
        }
        for (const st of frame.stations) {
            this.spatialGrid.addStation(st);
        }
        for (const th of frame.threats) {
            this.threats.set(th.id, th);
        }
        for (const agentData of frame.agents) {
            const fsm = new AgentStateMachine(agentData.id, agentData.state);
            this.fsms.set(agentData.id, fsm);
            const agent = {
                id: agentData.id,
                position: createVector(agentData.position.x, agentData.position.y),
                target: agentData.target ? createVector(agentData.target.x, agentData.target.y) : null,
                state: agentData.state,
                path: agentData.path.map((p) => createVector(p.x, p.y)),
                speed: agentData.speed,
                radius: agentData.radius,
                stamina: agentData.stamina,
                maxStamina: agentData.maxStamina,
                energyBurnRate: agentData.energyBurnRate,
                waypoints: agentData.waypoints.map((w) => createVector(w.x, w.y)),
                patrolIndex: agentData.patrolIndex ?? 0,
            };
            this.agents.set(agent.id, agent);
            this.spatialGrid.insertAgent(agent);
        }
    }
    /**
     * Seeks to an exact historical tick in time using recorded simulation frames.
     * Returns true if frame existed and state was restored, false otherwise.
     */
    seekToTick(tick) {
        if (!this.eventStore) {
            return false;
        }
        const frame = this.eventStore.getFrame(tick);
        if (!frame) {
            return false;
        }
        this.restoreFromFrame(frame);
        return true;
    }
    // --- Snapshot & State Restoration ---
    getSnapshot() {
        return {
            tick: this.currentTick,
            timestamp: Date.now(),
            agents: Array.from(this.agents.values()).map((a) => ({
                ...a,
                position: createVector(a.position.x, a.position.y),
                target: a.target ? createVector(a.target.x, a.target.y) : null,
                path: a.path.map((p) => createVector(p.x, p.y)),
                waypoints: a.waypoints.map((w) => createVector(w.x, w.y)),
            })),
            obstacles: this.spatialGrid.getAllObstacles().map((o) => createVector(o.x, o.y)),
            config: { ...this.config },
            cellTypes: this.spatialGrid.getAllCellTypes(),
            threats: Array.from(this.threats.values()),
            stations: this.spatialGrid.getStations().map((s) => createVector(s.x, s.y)),
        };
    }
    restoreFromSnapshot(snapshot) {
        this.currentTick = snapshot.tick;
        this.spatialGrid.clear();
        this.agents.clear();
        this.fsms.clear();
        this.threats.clear();
        if (snapshot.cellTypes) {
            for (const ct of snapshot.cellTypes) {
                this.spatialGrid.setCellType(ct.x, ct.y, ct.type);
            }
        }
        for (const obstacle of snapshot.obstacles) {
            this.spatialGrid.addObstacle(obstacle);
        }
        if (snapshot.stations) {
            for (const st of snapshot.stations) {
                this.spatialGrid.addStation(st);
            }
        }
        if (snapshot.threats) {
            for (const th of snapshot.threats) {
                this.threats.set(th.id, th);
            }
        }
        for (const agentData of snapshot.agents) {
            const fsm = new AgentStateMachine(agentData.id, agentData.state);
            this.fsms.set(agentData.id, fsm);
            const agent = {
                id: agentData.id,
                position: createVector(agentData.position.x, agentData.position.y),
                target: agentData.target ? createVector(agentData.target.x, agentData.target.y) : null,
                state: agentData.state,
                path: agentData.path.map((p) => createVector(p.x, p.y)),
                speed: agentData.speed,
                radius: agentData.radius,
                stamina: agentData.stamina,
                maxStamina: agentData.maxStamina,
                energyBurnRate: agentData.energyBurnRate,
                waypoints: agentData.waypoints.map((w) => createVector(w.x, w.y)),
                patrolIndex: agentData.patrolIndex ?? 0,
            };
            this.agents.set(agent.id, agent);
            this.spatialGrid.insertAgent(agent);
        }
    }
    dispose() {
        this.stop();
        this.eventListeners.clear();
        this.tickListeners.clear();
        this.spatialGrid.clear();
        this.agents.clear();
        this.fsms.clear();
        this.threats.clear();
    }
}
//# sourceMappingURL=Engine.js.map