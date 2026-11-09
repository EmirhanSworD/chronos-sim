/**
 * chronos-sim: Core Type Definitions
 * Deterministic simulation and event-sourced state engine types.
 */
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