/**
 * chronos-sim: Core Type Definitions
 * Deterministic simulation and event-sourced state engine types.
 */

export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

// --- Cell & Terrain Cost Types ---
export type CellType = 'EMPTY' | 'WALL' | 'MUD' | 'ROAD' | 'STATION';

export const CELL_COST: Record<CellType, number> = {
  EMPTY: 1.0,
  WALL: Infinity,
  MUD: 5.0,
  ROAD: 0.5,
  STATION: 1.0,
};

// --- Agent States & Definitions ---
export type AgentState =
  | 'IDLE'
  | 'PATROL'
  | 'NAVIGATING'
  | 'EVADING'
  | 'RECHARGING'
  | 'EXHAUSTED'
  | 'BLOCKED'
  | 'COMPLETED';

export interface Agent {
  readonly id: string;
  readonly position: Vector2D;
  readonly target: Vector2D | null;
  readonly state: AgentState;
  readonly path: readonly Vector2D[];
  readonly speed: number;
  readonly radius: number;
  readonly stamina: number;
  readonly maxStamina: number;
  readonly energyBurnRate: number;
  readonly waypoints: readonly Vector2D[];
  readonly patrolIndex?: number | undefined;
}

export interface Threat {
  readonly id: string;
  readonly position: Vector2D;
  readonly radius: number;
  readonly speed?: number | undefined;
}

export interface SimulationConfig {
  readonly tickRateMs: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly cellSize: number;
  readonly allowDiagonal: boolean;
  readonly diagonalCostMultiplier: number;
  readonly snapshotIntervalTicks: number;
  readonly defaultAgentSpeed: number;
  readonly maxAStarIterations: number;
  readonly defaultMaxStamina?: number | undefined;
  readonly defaultEnergyBurnRate?: number | undefined;
  readonly threatEvasionDistance?: number | undefined;
  readonly rechargeThresholdPercent?: number | undefined;
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  tickRateMs: 50,
  gridWidth: 100,
  gridHeight: 100,
  cellSize: 1.0,
  allowDiagonal: true,
  diagonalCostMultiplier: Math.SQRT2,
  snapshotIntervalTicks: 20,
  defaultAgentSpeed: 1.0,
  maxAStarIterations: 10000,
  defaultMaxStamina: 100,
  defaultEnergyBurnRate: 0.5,
  threatEvasionDistance: 5.0,
  rechargeThresholdPercent: 20,
};

// --- Simulation Events ---

export interface AgentSpawnedEvent {
  readonly type: 'AGENT_SPAWNED';
  readonly tick: number;
  readonly timestamp: number;
  readonly agent: Agent;
}

export interface AgentDespawnedEvent {
  readonly type: 'AGENT_DESPAWNED';
  readonly tick: number;
  readonly timestamp: number;
  readonly agentId: string;
}

export interface AgentMovedEvent {
  readonly type: 'AGENT_MOVED';
  readonly tick: number;
  readonly timestamp: number;
  readonly agentId: string;
  readonly from: Vector2D;
  readonly to: Vector2D;
  readonly stamina?: number | undefined;
}

export interface AgentStateChangedEvent {
  readonly type: 'AGENT_STATE_CHANGED';
  readonly tick: number;
  readonly timestamp: number;
  readonly agentId: string;
  readonly previousState: AgentState;
  readonly newState: AgentState;
  readonly reason?: string | undefined;
}

export interface PathCalculatedEvent {
  readonly type: 'PATH_CALCULATED';
  readonly tick: number;
  readonly timestamp: number;
  readonly agentId: string;
  readonly from: Vector2D;
  readonly to: Vector2D;
  readonly path: readonly Vector2D[];
  readonly pathLength: number;
  readonly totalCost?: number | undefined;
}

export interface AgentReachedTargetEvent {
  readonly type: 'AGENT_REACHED_TARGET';
  readonly tick: number;
  readonly timestamp: number;
  readonly agentId: string;
  readonly target: Vector2D;
}

export interface AgentBlockedEvent {
  readonly type: 'AGENT_BLOCKED';
  readonly tick: number;
  readonly timestamp: number;
  readonly agentId: string;
  readonly position: Vector2D;
  readonly target: Vector2D;
  readonly reason: string;
}

export interface AgentEvadingEvent {
  readonly type: 'AGENT_EVADING';
  readonly tick: number;
  readonly timestamp: number;
  readonly agentId: string;
  readonly threatId: string;
  readonly threatPosition: Vector2D;
  readonly evasionVector: Vector2D;
}

export interface AgentRechargingEvent {
  readonly type: 'AGENT_RECHARGING';
  readonly tick: number;
  readonly timestamp: number;
  readonly agentId: string;
  readonly stationPosition: Vector2D;
  readonly currentStamina: number;
}

export interface AgentExhaustedEvent {
  readonly type: 'AGENT_EXHAUSTED';
  readonly tick: number;
  readonly timestamp: number;
  readonly agentId: string;
  readonly position: Vector2D;
}

export interface ObstacleAddedEvent {
  readonly type: 'OBSTACLE_ADDED';
  readonly tick: number;
  readonly timestamp: number;
  readonly position: Vector2D;
}

export interface ObstacleRemovedEvent {
  readonly type: 'OBSTACLE_REMOVED';
  readonly tick: number;
  readonly timestamp: number;
  readonly position: Vector2D;
}

export interface ThreatSpawnedEvent {
  readonly type: 'THREAT_SPAWNED';
  readonly tick: number;
  readonly timestamp: number;
  readonly threat: Threat;
}

export interface ThreatRemovedEvent {
  readonly type: 'THREAT_REMOVED';
  readonly tick: number;
  readonly timestamp: number;
  readonly threatId: string;
}

export interface CellTypeChangedEvent {
  readonly type: 'CELL_TYPE_CHANGED';
  readonly tick: number;
  readonly timestamp: number;
  readonly position: Vector2D;
  readonly cellType: CellType;
  readonly cost: number;
}

export interface SimulationStartedEvent {
  readonly type: 'SIMULATION_STARTED';
  readonly tick: number;
  readonly timestamp: number;
  readonly config: SimulationConfig;
}

export interface SimulationStoppedEvent {
  readonly type: 'SIMULATION_STOPPED';
  readonly tick: number;
  readonly timestamp: number;
}

export interface SnapshotCreatedEvent {
  readonly type: 'SNAPSHOT_CREATED';
  readonly tick: number;
  readonly timestamp: number;
  readonly agentCount: number;
  readonly obstacleCount: number;
}

export type SimulationEvent =
  | AgentSpawnedEvent
  | AgentDespawnedEvent
  | AgentMovedEvent
  | AgentStateChangedEvent
  | PathCalculatedEvent
  | AgentReachedTargetEvent
  | AgentBlockedEvent
  | AgentEvadingEvent
  | AgentRechargingEvent
  | AgentExhaustedEvent
  | ObstacleAddedEvent
  | ObstacleRemovedEvent
  | ThreatSpawnedEvent
  | ThreatRemovedEvent
  | CellTypeChangedEvent
  | SimulationStartedEvent
  | SimulationStoppedEvent
  | SnapshotCreatedEvent;

export type SimulationEventType = SimulationEvent['type'];

export interface TickEvent {
  readonly tick: number;
  readonly timestamp: number;
  readonly deltaMs: number;
  readonly activeAgents: number;
  readonly events: readonly SimulationEvent[];
}

export interface SimulationSnapshot {
  readonly tick: number;
  readonly timestamp: number;
  readonly agents: readonly Agent[];
  readonly obstacles: readonly Vector2D[];
  readonly config: SimulationConfig;
  readonly cellTypes?: readonly { readonly x: number; readonly y: number; readonly type: CellType }[] | undefined;
  readonly threats?: readonly Threat[] | undefined;
  readonly stations?: readonly Vector2D[] | undefined;
}

export interface SimulationFrame {
  readonly tick: number;
  readonly timestamp: number;
  readonly agents: readonly Agent[];
  readonly obstacles: readonly Vector2D[];
  readonly cellTypes: readonly { readonly x: number; readonly y: number; readonly type: CellType }[];
  readonly threats: readonly Threat[];
  readonly stations: readonly Vector2D[];
}

// --- Vector Math Helper Utilities ---

export function createVector(x: number, y: number): Vector2D {
  return { x, y };
}

export function vectorEquals(a: Vector2D, b: Vector2D, tolerance = 1e-6): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

export function vectorDistanceSq(a: Vector2D, b: Vector2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function vectorDistance(a: Vector2D, b: Vector2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function vectorManhattan(a: Vector2D, b: Vector2D): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function vectorAdd(a: Vector2D, b: Vector2D): Vector2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vectorSubtract(a: Vector2D, b: Vector2D): Vector2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vectorScale(v: Vector2D, scale: number): Vector2D {
  return { x: v.x * scale, y: v.y * scale };
}

export function vectorNormalize(v: Vector2D): Vector2D {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return { x: v.x / len, y: v.y / len };
}

export function vectorLerp(a: Vector2D, b: Vector2D, t: number): Vector2D {
  const clampedT = Math.max(0, Math.min(1, t));
  return {
    x: a.x + (b.x - a.x) * clampedT,
    y: a.y + (b.y - a.y) * clampedT,
  };
}

export function vectorRound(v: Vector2D): Vector2D {
  return {
    x: Math.round(v.x),
    y: Math.round(v.y),
  };
}

export function vectorKey(v: Vector2D): string {
  return `${Math.round(v.x)}:${Math.round(v.y)}`;
}
