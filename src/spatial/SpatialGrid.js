import { vectorDistanceSq } from '../core/Types.js';
/**
 * 2D Spatial Hash Grid
 * Provides O(1) average lookup for near neighbors, dynamic obstacle tracking,
 * and spatial indexing of moving agents without brute-force pairwise distance checks.
 */
export class SpatialGrid {
    width;
    height;
    cellSize;
    cols;
    rows;
    /** Map of cellKey -> Set of agent IDs located in that cell */
    agentCells = new Map();
    /** Map of agentId -> agent data and its current cellKey */
    agents = new Map();
    /** Map of cellKey -> Obstacle Vector2D */
    obstacles = new Map();
    constructor(options) {
        if (options.width <= 0 || options.height <= 0 || options.cellSize <= 0) {
            throw new Error('SpatialGrid dimensions and cellSize must be positive numbers');
        }
        this.width = options.width;
        this.height = options.height;
        this.cellSize = options.cellSize;
        this.cols = Math.ceil(this.width / this.cellSize);
        this.rows = Math.ceil(this.height / this.cellSize);
    }
    // --- Coordinate Mapping & Bounds ---
    /** Converts world coordinates to discrete grid cell coordinates */
    worldToCell(pos) {
        return {
            cx: Math.floor(pos.x / this.cellSize),
            cy: Math.floor(pos.y / this.cellSize),
        };
    }
    /** Converts cell coordinates to world center of that cell */
    cellToWorld(cx, cy) {
        return {
            x: (cx + 0.5) * this.cellSize,
            y: (cy + 0.5) * this.cellSize,
        };
    }
    /** Generates a unique string hash key for a cell coordinate */
    cellKey(cx, cy) {
        return `${cx}:${cy}`;
    }
    /** Generates a cell hash key directly from world coordinates */
    posKey(pos) {
        const { cx, cy } = this.worldToCell(pos);
        return this.cellKey(cx, cy);
    }
    /** Checks if world position is inside simulation boundaries */
    isInBounds(pos) {
        return pos.x >= 0 && pos.x < this.width && pos.y >= 0 && pos.y < this.height;
    }
    /** Checks if cell coordinates are inside grid bounds */
    isCellInBounds(cx, cy) {
        return cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows;
    }
    // --- Dynamic Obstacle Management ---
    /**
     * Registers a dynamic obstacle at the given position.
     * Returns true if newly added, false if already present or out of bounds.
     */
    addObstacle(pos) {
        if (!this.isInBounds(pos)) {
            return false;
        }
        const { cx, cy } = this.worldToCell(pos);
        const key = this.cellKey(cx, cy);
        if (this.obstacles.has(key)) {
            return false;
        }
        this.obstacles.set(key, { x: cx * this.cellSize, y: cy * this.cellSize });
        return true;
    }
    /**
     * Removes a dynamic obstacle at the given position.
     * Returns true if removed, false if not found.
     */
    removeObstacle(pos) {
        const key = this.posKey(pos);
        return this.obstacles.delete(key);
    }
    /**
     * Checks whether a specific world coordinate or cell is blocked by an obstacle.
     */
    hasObstacle(pos) {
        const key = this.posKey(pos);
        return this.obstacles.has(key);
    }
    /**
     * Checks whether specific cell coordinates are blocked by an obstacle.
     */
    hasObstacleAtCell(cx, cy) {
        return this.obstacles.has(this.cellKey(cx, cy));
    }
    /**
     * Checks whether a cell coordinate is traversable (within bounds and no obstacle).
     */
    isTraversableCell(cx, cy) {
        return this.isCellInBounds(cx, cy) && !this.hasObstacleAtCell(cx, cy);
    }
    /** Returns all registered obstacle positions */
    getAllObstacles() {
        return Array.from(this.obstacles.values());
    }
    /** Total obstacle count */
    get obstacleCount() {
        return this.obstacles.size;
    }
    /** Clears all obstacles */
    clearObstacles() {
        this.obstacles.clear();
    }
    // --- Agent Spatial Indexing ---
    /**
     * Inserts an agent into the spatial grid.
     */
    insertAgent(agent) {
        const key = this.posKey(agent.position);
        this.agents.set(agent.id, { agent, cellKey: key });
        let cell = this.agentCells.get(key);
        if (!cell) {
            cell = new Set();
            this.agentCells.set(key, cell);
        }
        cell.add(agent.id);
    }
    /**
     * Updates an agent's position in the spatial grid in O(1) time.
     */
    updateAgent(agent) {
        const existing = this.agents.get(agent.id);
        const newKey = this.posKey(agent.position);
        if (!existing) {
            this.insertAgent(agent);
            return;
        }
        if (existing.cellKey !== newKey) {
            // Remove from old bucket
            const oldCell = this.agentCells.get(existing.cellKey);
            if (oldCell) {
                oldCell.delete(agent.id);
                if (oldCell.size === 0) {
                    this.agentCells.delete(existing.cellKey);
                }
            }
            // Add to new bucket
            let newCell = this.agentCells.get(newKey);
            if (!newCell) {
                newCell = new Set();
                this.agentCells.set(newKey, newCell);
            }
            newCell.add(agent.id);
        }
        this.agents.set(agent.id, { agent, cellKey: newKey });
    }
    /**
     * Removes an agent from the spatial grid.
     */
    removeAgent(agentId) {
        const existing = this.agents.get(agentId);
        if (!existing) {
            return false;
        }
        const cell = this.agentCells.get(existing.cellKey);
        if (cell) {
            cell.delete(agentId);
            if (cell.size === 0) {
                this.agentCells.delete(existing.cellKey);
            }
        }
        this.agents.delete(agentId);
        return true;
    }
    /** Retrieves an agent by its ID */
    getAgent(agentId) {
        return this.agents.get(agentId)?.agent;
    }
    /** Returns all active agents currently registered */
    getAllAgents() {
        const result = [];
        for (const entry of this.agents.values()) {
            result.push(entry.agent);
        }
        return result;
    }
    /** Total agent count */
    get agentCount() {
        return this.agents.size;
    }
    // --- O(1) Neighbor and Spatial Range Queries ---
    /**
     * Queries all agents within a given Euclidean radius of the center.
     * Runs in O(1) average time when radius is bounded relative to cell size.
     */
    queryRadius(center, radius) {
        if (radius <= 0) {
            return [];
        }
        const radiusSq = radius * radius;
        const minCx = Math.max(0, Math.floor((center.x - radius) / this.cellSize));
        const maxCx = Math.min(this.cols - 1, Math.floor((center.x + radius) / this.cellSize));
        const minCy = Math.max(0, Math.floor((center.y - radius) / this.cellSize));
        const maxCy = Math.min(this.rows - 1, Math.floor((center.y + radius) / this.cellSize));
        const results = [];
        for (let cy = minCy; cy <= maxCy; cy++) {
            for (let cx = minCx; cx <= maxCx; cx++) {
                const key = this.cellKey(cx, cy);
                const cell = this.agentCells.get(key);
                if (!cell || cell.size === 0) {
                    continue;
                }
                for (const agentId of cell) {
                    const entry = this.agents.get(agentId);
                    if (entry && vectorDistanceSq(entry.agent.position, center) <= radiusSq) {
                        results.push(entry.agent);
                    }
                }
            }
        }
        return results;
    }
    /**
     * Finds the nearest agent to the center within maxRadius, optionally matching a filter predicate.
     */
    queryNearest(center, maxRadius, filter) {
        const candidates = this.queryRadius(center, maxRadius);
        let nearest = null;
        let minDistanceSq = maxRadius * maxRadius;
        for (const agent of candidates) {
            if (filter && !filter(agent)) {
                continue;
            }
            const distSq = vectorDistanceSq(agent.position, center);
            if (distSq < minDistanceSq) {
                minDistanceSq = distSq;
                nearest = agent;
            }
        }
        if (!nearest) {
            return null;
        }
        return {
            agent: nearest,
            distanceSq: minDistanceSq,
        };
    }
    /**
     * Retrieves obstacles within a given radius.
     */
    queryObstaclesInRadius(center, radius) {
        if (radius <= 0) {
            return [];
        }
        const radiusSq = radius * radius;
        const minCx = Math.max(0, Math.floor((center.x - radius) / this.cellSize));
        const maxCx = Math.min(this.cols - 1, Math.floor((center.x + radius) / this.cellSize));
        const minCy = Math.max(0, Math.floor((center.y - radius) / this.cellSize));
        const maxCy = Math.min(this.rows - 1, Math.floor((center.y + radius) / this.cellSize));
        const results = [];
        for (let cy = minCy; cy <= maxCy; cy++) {
            for (let cx = minCx; cx <= maxCx; cx++) {
                const key = this.cellKey(cx, cy);
                const obstacle = this.obstacles.get(key);
                if (obstacle && vectorDistanceSq(obstacle, center) <= radiusSq) {
                    results.push(obstacle);
                }
            }
        }
        return results;
    }
    /** Resets agents and obstacles */
    clear() {
        this.agentCells.clear();
        this.agents.clear();
        this.obstacles.clear();
    }
}
//# sourceMappingURL=SpatialGrid.js.map