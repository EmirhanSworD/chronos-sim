/**
 * chronos-sim: Core Type Definitions
 * Deterministic simulation and event-sourced state engine types.
 */

export interface Vector2D {
  readonly x: number;
  readonly y: number;
}

export type AgentState = 'IDLE' | 'NAVIGATING' | 'BLOCKED' | 'COMPLETED';

export interface Agent {
  readonly id: string;
  readonly position: Vector2D;
  readonly target: Vector2D | null;
  readonly state: AgentState;
  readonly path: readonly Vector2D[];
  readonly speed: number;
  readonly radius: number;
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
  | ObstacleAddedEvent
  | ObstacleRemovedEvent
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
