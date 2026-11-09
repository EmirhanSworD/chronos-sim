import type { Agent, CellType, Vector2D } from '../core/Types.js';
import { CELL_COST, vectorDistanceSq } from '../core/Types.js';

export interface SpatialGridOptions {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
}

/**
 * 2D Spatial Hash Grid with Terrain Costs & Dynamic Obstacle Tracking.
 * Provides O(1) average lookup for near neighbors, terrain cell types (EMPTY, WALL, MUD, ROAD, STATION),
 * dynamic obstacle management, and station queries.
 */
export class SpatialGrid {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;

  /** Map of cellKey -> Set of agent IDs located in that cell */
  private readonly agentCells: Map<string, Set<string>> = new Map();

  /** Map of agentId -> agent data and its current cellKey */
  private readonly agents: Map<string, { agent: Agent; cellKey: string }> = new Map();

  /** Map of cellKey -> Obstacle Vector2D */
  private readonly obstacles: Map<string, Vector2D> = new Map();

  /** Map of cellKey -> CellType (MUD, ROAD, STATION, etc.) */
  private readonly cellTypes: Map<string, CellType> = new Map();

  /** Map of cellKey -> Station Vector2D */
  private readonly stations: Map<string, Vector2D> = new Map();

  constructor(options: SpatialGridOptions) {
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
  public worldToCell(pos: Vector2D): { readonly cx: number; readonly cy: number } {
    return {
      cx: Math.floor(pos.x / this.cellSize),
      cy: Math.floor(pos.y / this.cellSize),
    };
  }

  /** Converts cell coordinates to world center of that cell */
  public cellToWorld(cx: number, cy: number): Vector2D {
    return {
      x: (cx + 0.5) * this.cellSize,
      y: (cy + 0.5) * this.cellSize,
    };
  }

  /** Generates a unique string hash key for a cell coordinate */
  public cellKey(cx: number, cy: number): string {
    return `${cx}:${cy}`;
  }

  /** Generates a cell hash key directly from world coordinates */
  public posKey(pos: Vector2D): string {
    const { cx, cy } = this.worldToCell(pos);
    return this.cellKey(cx, cy);
  }

  /** Checks if world position is inside simulation boundaries */
  public isInBounds(pos: Vector2D): boolean {
    return pos.x >= 0 && pos.x < this.width && pos.y >= 0 && pos.y < this.height;
  }

  /** Checks if cell coordinates are inside grid bounds */
  public isCellInBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows;
  }

  // --- Terrain & Cell Type Management ---

  /**
   * Sets the terrain type for a cell.
   */
  public setCellType(cx: number, cy: number, type: CellType): void {
    if (!this.isCellInBounds(cx, cy)) {
      return;
    }
    const key = this.cellKey(cx, cy);
    if (type === 'EMPTY') {
      this.cellTypes.delete(key);
      this.stations.delete(key);
    } else {
      this.cellTypes.set(key, type);
      if (type === 'STATION') {
        this.stations.set(key, this.cellToWorld(cx, cy));
      } else {
        this.stations.delete(key);
      }
    }
  }

  /**
   * Gets the cell type for a cell coordinate.
   */
  public getCellType(cx: number, cy: number): CellType {
    const key = this.cellKey(cx, cy);
    if (this.obstacles.has(key)) {
      return 'WALL';
    }
    return this.cellTypes.get(key) ?? 'EMPTY';
  }

  /**
   * Gets the traversal cost of a cell.
   * EMPTY: 1.0, ROAD: 0.5, MUD: 5.0, STATION: 1.0, WALL: Infinity.
   */
  public getCellCost(cx: number, cy: number): number {
    const type = this.getCellType(cx, cy);
    return CELL_COST[type] ?? 1.0;
  }

  /**
   * Registers a charging station at the specified position.
   */
  public addStation(pos: Vector2D): void {
    const { cx, cy } = this.worldToCell(pos);
    this.setCellType(cx, cy, 'STATION');
  }

  /**
   * Removes a charging station at the specified position.
   */
  public removeStation(pos: Vector2D): boolean {
    const { cx, cy } = this.worldToCell(pos);
    const key = this.cellKey(cx, cy);
    if (this.stations.has(key)) {
      this.stations.delete(key);
      this.cellTypes.delete(key);
      return true;
    }
    return false;
  }

  /** Returns all registered station positions */
  public getStations(): readonly Vector2D[] {
    return Array.from(this.stations.values());
  }

  /**
   * Finds the nearest charging station to a given position.
   */
  public findNearestStation(pos: Vector2D): Vector2D | null {
    let nearest: Vector2D | null = null;
    let minDistSq = Infinity;

    for (const station of this.stations.values()) {
      const dSq = vectorDistanceSq(pos, station);
      if (dSq < minDistSq) {
        minDistSq = dSq;
        nearest = station;
      }
    }

    return nearest;
  }

  /** Returns all customized cell types */
  public getAllCellTypes(): readonly { readonly x: number; readonly y: number; readonly type: CellType }[] {
    const results: { x: number; y: number; type: CellType }[] = [];
    for (const [key, type] of this.cellTypes.entries()) {
      const [cxStr, cyStr] = key.split(':');
      if (cxStr !== undefined && cyStr !== undefined) {
        results.push({ x: Number(cxStr), y: Number(cyStr), type });
      }
    }
    return results;
  }

  // --- Dynamic Obstacle Management ---

  /**
   * Registers a dynamic obstacle at the given position.
   * Returns true if newly added, false if already present or out of bounds.
   */
  public addObstacle(pos: Vector2D): boolean {
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
  public removeObstacle(pos: Vector2D): boolean {
    const key = this.posKey(pos);
    return this.obstacles.delete(key);
  }

  /**
   * Checks whether a specific world coordinate or cell is blocked by an obstacle.
   */
  public hasObstacle(pos: Vector2D): boolean {
    const key = this.posKey(pos);
    return this.obstacles.has(key) || this.cellTypes.get(key) === 'WALL';
  }

  /**
   * Checks whether specific cell coordinates are blocked by an obstacle.
   */
  public hasObstacleAtCell(cx: number, cy: number): boolean {
    return this.getCellType(cx, cy) === 'WALL';
  }

  /**
   * Checks whether a cell coordinate is traversable (within bounds and not a wall).
   */
  public isTraversableCell(cx: number, cy: number): boolean {
    return this.isCellInBounds(cx, cy) && this.getCellType(cx, cy) !== 'WALL';
  }

  /** Returns all registered obstacle positions */
  public getAllObstacles(): readonly Vector2D[] {
    return Array.from(this.obstacles.values());
  }

  /** Total obstacle count */
  public get obstacleCount(): number {
    return this.obstacles.size;
  }

  /** Clears all obstacles */
  public clearObstacles(): void {
    this.obstacles.clear();
  }

  // --- Agent Spatial Indexing ---

  /**
   * Inserts an agent into the spatial grid.
   */
  public insertAgent(agent: Agent): void {
    const key = this.posKey(agent.position);
    this.agents.set(agent.id, { agent, cellKey: key });

    let cell = this.agentCells.get(key);
    if (!cell) {
      cell = new Set<string>();
      this.agentCells.set(key, cell);
    }
    cell.add(agent.id);
  }

  /**
   * Updates an agent's position in the spatial grid in O(1) time.
   */
  public updateAgent(agent: Agent): void {
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
        newCell = new Set<string>();
        this.agentCells.set(newKey, newCell);
      }
      newCell.add(agent.id);
    }

    this.agents.set(agent.id, { agent, cellKey: newKey });
  }

  /**
   * Removes an agent from the spatial grid.
   */
  public removeAgent(agentId: string): boolean {
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
  public getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId)?.agent;
  }

  /** Returns all active agents currently registered */
  public getAllAgents(): readonly Agent[] {
    const result: Agent[] = [];
    for (const entry of this.agents.values()) {
      result.push(entry.agent);
    }
    return result;
  }

  /** Total agent count */
  public get agentCount(): number {
    return this.agents.size;
  }

  // --- O(1) Neighbor and Spatial Range Queries ---

  /**
   * Queries all agents within a given Euclidean radius of the center.
   * Runs in O(1) average time when radius is bounded relative to cell size.
   */
  public queryRadius(center: Vector2D, radius: number): Agent[] {
    if (radius <= 0) {
      return [];
    }

    const radiusSq = radius * radius;
    const minCx = Math.max(0, Math.floor((center.x - radius) / this.cellSize));
    const maxCx = Math.min(this.cols - 1, Math.floor((center.x + radius) / this.cellSize));
    const minCy = Math.max(0, Math.floor((center.y - radius) / this.cellSize));
    const maxCy = Math.min(this.rows - 1, Math.floor((center.y + radius) / this.cellSize));

    const results: Agent[] = [];

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
  public queryNearest(
    center: Vector2D,
    maxRadius: number,
    filter?: (agent: Agent) => boolean
  ): { readonly agent: Agent; readonly distanceSq: number } | null {
    const candidates = this.queryRadius(center, maxRadius);
    let nearest: Agent | null = null;
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
  public queryObstaclesInRadius(center: Vector2D, radius: number): Vector2D[] {
    if (radius <= 0) {
      return [];
    }

    const radiusSq = radius * radius;
    const minCx = Math.max(0, Math.floor((center.x - radius) / this.cellSize));
    const maxCx = Math.min(this.cols - 1, Math.floor((center.x + radius) / this.cellSize));
    const minCy = Math.max(0, Math.floor((center.y - radius) / this.cellSize));
    const maxCy = Math.min(this.rows - 1, Math.floor((center.y + radius) / this.cellSize));

    const results: Vector2D[] = [];

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

  /** Resets agents, obstacles, and cell types */
  public clear(): void {
    this.agentCells.clear();
    this.agents.clear();
    this.obstacles.clear();
    this.cellTypes.clear();
    this.stations.clear();
  }
}
