import type { Agent, AgentState, CellType, SimulationConfig, SimulationEvent, SimulationEventType, SimulationFrame, SimulationSnapshot, Threat, TickEvent, Vector2D } from './Types.js';
import { SpatialGrid } from '../spatial/SpatialGrid.js';
import { AStarPathfinder } from '../spatial/Pathfinding.js';
import type { EventStore } from '../storage/EventStore.js';
export interface SpawnAgentOptions {
    readonly id: string;
    readonly position: Vector2D;
    readonly target?: Vector2D | undefined;
    readonly speed?: number | undefined;
    readonly radius?: number | undefined;
    readonly stamina?: number | undefined;
    readonly maxStamina?: number | undefined;
    readonly energyBurnRate?: number | undefined;
    readonly waypoints?: readonly Vector2D[] | undefined;
    readonly state?: AgentState | undefined;
}
export interface EngineOptions {
    readonly config?: Partial<SimulationConfig> | undefined;
    readonly eventStore?: EventStore | undefined;
}
type EventCallback = (event: SimulationEvent) => void;
type TickCallback = (tickEvent: TickEvent) => void;
/**
 * Deterministic Advanced Simulation Engine (Chronos Engine).
 * Orchestrates spatial hash indexing, terrain-cost A* pathfinding,
 * finite state machines, dynamic predator evasion, stamina management,
 * and charging station cycles.
 */
export declare class SimulationEngine {
    config: SimulationConfig;
    readonly spatialGrid: SpatialGrid;
    readonly pathfinder: AStarPathfinder;
    private currentTick;
    private isRunning;
    private timerHandle;
    private readonly eventStore;
    /** Registered agents map: agentId -> mutable state record */
    private readonly agents;
    /** Agent state machines map: agentId -> FSM */
    private readonly fsms;
    /** Threats (Predators) in the environment */
    private readonly threats;
    /** Event listeners */
    private readonly eventListeners;
    private readonly tickListeners;
    constructor(options?: EngineOptions | undefined);
    get tick(): number;
    get active(): boolean;
    getAgent(id: string): Agent | undefined;
    getAllAgents(): readonly Agent[];
    getAgentState(id: string): AgentState | undefined;
    /** Subscribes to all discrete simulation events */
    subscribe(listener: EventCallback): () => void;
    /** Subscribes to tick completion summaries */
    onTick(listener: TickCallback): () => void;
    /** Subscribes to a specific simulation event type */
    on<T extends SimulationEventType>(type: T, listener: (event: Extract<SimulationEvent, {
        type: T;
    }>) => void): () => void;
    addThreat(threat: Threat): void;
    removeThreat(threatId: string): boolean;
    getThreat(threatId: string): Threat | undefined;
    getAllThreats(): readonly Threat[];
    updateThreatPosition(threatId: string, position: Vector2D): boolean;
    addStation(position: Vector2D): void;
    removeStation(position: Vector2D): boolean;
    getAllStations(): readonly Vector2D[];
    findNearestStation(position: Vector2D): Vector2D | null;
    setCellType(position: Vector2D, type: CellType): void;
    getCellType(position: Vector2D): CellType;
    getCellCost(position: Vector2D): number;
    /**
     * Spawns a new agent into the simulation with stamina and waypoints.
     */
    spawnAgent(options: SpawnAgentOptions): Agent;
    /**
     * Configures patrol waypoints for an agent.
     */
    setAgentPatrol(agentId: string, waypoints: readonly Vector2D[]): boolean;
    /**
     * Removes an agent from the simulation.
     */
    despawnAgent(agentId: string): boolean;
    /**
     * Assigns a destination target to an agent and triggers path calculation.
     */
    setAgentTarget(agentId: string, target: Vector2D): boolean;
    /**
     * Adds a dynamic obstacle at the specified position.
     */
    addObstacle(position: Vector2D): boolean;
    /**
     * Removes a dynamic obstacle.
     */
    removeObstacle(position: Vector2D): boolean;
    /**
     * Executes a single fixed simulation tick deterministically.
     * Updates threats, manages stamina, handles predator evasion,
     * routes to charging stations, and advances agents along paths.
     */
    step(): TickEvent;
    /**
     * Updates a single agent during the simulation tick:
     * 1. Evaluates predator threat proximity (< 5.0 units) -> triggers EVADING state and escape vector.
     * 2. Checks stamina (< 20%) -> prioritizes routing to nearest STATION cell.
     * 3. Executes recharging if on station cell.
     * 4. Updates patrol waypoint cycling or normal navigation.
     * 5. Burns stamina based on terrain movement cost.
     */
    private updateAgentStep;
    /** Emits an event immediately to subscribers and EventStore */
    private emitEvent;
    start(): void;
    stop(): void;
    /**
     * Dynamically adjusts the tick rate / simulation speed in milliseconds.
     */
    setTickRate(tickRateMs: number): void;
    /**
     * Captures the current complete simulation frame for state preservation.
     */
    getCurrentFrame(): SimulationFrame;
    /**
     * Restores the exact simulation state from a serialized SimulationFrame.
     */
    restoreFromFrame(frame: SimulationFrame): void;
    /**
     * Seeks to an exact historical tick in time using recorded simulation frames.
     * Returns true if frame existed and state was restored, false otherwise.
     */
    seekToTick(tick: number): boolean;
    getSnapshot(): SimulationSnapshot;
    restoreFromSnapshot(snapshot: SimulationSnapshot): void;
    dispose(): void;
}
export {};
//# sourceMappingURL=Engine.d.ts.map