/**
 * chronos-sim: Core Type Definitions
 * Deterministic simulation and event-sourced state engine types.
 */
export const CELL_COST = {
    EMPTY: 1.0,
    WALL: Infinity,
    MUD: 5.0,
    ROAD: 0.5,
    STATION: 1.0,
};
export const DEFAULT_SIMULATION_CONFIG = {
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
// --- Vector Math Helper Utilities ---
export function createVector(x, y) {
    return { x, y };
}
export function vectorEquals(a, b, tolerance = 1e-6) {
    return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}
export function vectorDistanceSq(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}
export function vectorDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}
export function vectorManhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
export function vectorAdd(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
}
export function vectorSubtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}
export function vectorScale(v, scale) {
    return { x: v.x * scale, y: v.y * scale };
}
export function vectorNormalize(v) {
    const len = Math.hypot(v.x, v.y);
    if (len === 0) {
        return { x: 0, y: 0 };
    }
    return { x: v.x / len, y: v.y / len };
}
export function vectorLerp(a, b, t) {
    const clampedT = Math.max(0, Math.min(1, t));
    return {
        x: a.x + (b.x - a.x) * clampedT,
        y: a.y + (b.y - a.y) * clampedT,
    };
}
export function vectorRound(v) {
    return {
        x: Math.round(v.x),
        y: Math.round(v.y),
    };
}
export function vectorKey(v) {
    return `${Math.round(v.x)}:${Math.round(v.y)}`;
}
//# sourceMappingURL=Types.js.map