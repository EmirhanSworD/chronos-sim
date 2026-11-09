import Database from 'better-sqlite3';
import type {
  SimulationEvent,
  SimulationEventType,
  SimulationSnapshot,
} from '../core/Types.js';
import { vectorKey } from '../core/Types.js';

interface EventRow {
  readonly id: number;
  readonly tick: number;
  readonly event_type: string;
  readonly aggregate_id: string | null;
  readonly payload: string;
  readonly timestamp: number;
}

interface SnapshotRow {
  readonly tick: number;
  readonly timestamp: number;
  readonly agent_count: number;
  readonly obstacle_count: number;
  readonly state: string;
}

interface CountRow {
  readonly count: number;
}

export interface EventStoreOptions {
  /** Database file path or ':memory:' */
  readonly path?: string | undefined;
  /** In-memory database shortcut */
  readonly inMemory?: boolean | undefined;
}

/**
 * High-Performance Event Store backed by SQLite with WAL (Write-Ahead-Log) mode.
 * Supports transactional appending of events and simulation snapshots,
 * enabling full state reconstruction and deterministic replay.
 */
export class EventStore {
  private readonly db: Database.Database;
  private readonly insertEventStmt: Database.Statement;
  private readonly insertSnapshotStmt: Database.Statement;
  private readonly batchInsertEventsTx: (events: readonly SimulationEvent[]) => void;
  private readonly saveSnapshotTx: (snapshot: SimulationSnapshot) => void;

  constructor(options?: EventStoreOptions) {
    const dbPath = options?.inMemory ? ':memory:' : (options?.path ?? ':memory:');
    this.db = new Database(dbPath);

    this.configurePragmas(dbPath !== ':memory:');
    this.initTables();

    this.insertEventStmt = this.db.prepare(`
      INSERT INTO events (tick, event_type, aggregate_id, payload, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.insertSnapshotStmt = this.db.prepare(`
      INSERT OR REPLACE INTO snapshots (tick, timestamp, agent_count, obstacle_count, state)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Prepare transaction blocks
    this.batchInsertEventsTx = this.db.transaction((events: readonly SimulationEvent[]) => {
      for (const event of events) {
        const aggregateId = this.extractAggregateId(event);
        const payload = JSON.stringify(event);
        this.insertEventStmt.run(
          event.tick,
          event.type,
          aggregateId,
          payload,
          event.timestamp
        );
      }
    });

    this.saveSnapshotTx = this.db.transaction((snapshot: SimulationSnapshot) => {
      const stateJson = JSON.stringify(snapshot);
      this.insertSnapshotStmt.run(
        snapshot.tick,
        snapshot.timestamp,
        snapshot.agents.length,
        snapshot.obstacles.length,
        stateJson
      );
    });
  }

  private configurePragmas(enableWal: boolean): void {
    if (enableWal) {
      // Set Write-Ahead Logging mode for concurrency and durability
      this.db.pragma('journal_mode = WAL');
    }
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('cache_size = -64000'); // 64 MB cache
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tick INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        aggregate_id TEXT,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events(aggregate_id);

      CREATE TABLE IF NOT EXISTS snapshots (
        tick INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        agent_count INTEGER NOT NULL,
        obstacle_count INTEGER NOT NULL,
        state TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_tick ON snapshots(tick);
    `);
  }

  private extractAggregateId(event: SimulationEvent): string | null {
    switch (event.type) {
      case 'AGENT_SPAWNED':
        return event.agent.id;
      case 'AGENT_DESPAWNED':
      case 'AGENT_MOVED':
      case 'AGENT_STATE_CHANGED':
      case 'PATH_CALCULATED':
      case 'AGENT_REACHED_TARGET':
      case 'AGENT_BLOCKED':
        return event.agentId;
      case 'OBSTACLE_ADDED':
      case 'OBSTACLE_REMOVED':
        return vectorKey(event.position);
      case 'SIMULATION_STARTED':
      case 'SIMULATION_STOPPED':
      case 'SNAPSHOT_CREATED':
        return null;
    }
  }

  /**
   * Appends a single event to the database.
   */
  public appendEvent(event: SimulationEvent): void {
    const aggregateId = this.extractAggregateId(event);
    const payload = JSON.stringify(event);
    this.insertEventStmt.run(
      event.tick,
      event.type,
      aggregateId,
      payload,
      event.timestamp
    );
  }

  /**
   * Appends multiple events in an atomic transaction block.
   */
  public appendEvents(events: readonly SimulationEvent[]): void {
    if (events.length === 0) {
      return;
    }
    this.batchInsertEventsTx(events);
  }

  /**
   * Saves a full simulation state snapshot in a transaction block.
   */
  public saveSnapshot(snapshot: SimulationSnapshot): void {
    this.saveSnapshotTx(snapshot);
  }

  /**
   * Retrieves simulation events within an optional tick range.
   */
  public getEvents(fromTick = 0, toTick?: number): SimulationEvent[] {
    let rows: EventRow[];
    if (toTick !== undefined) {
      const stmt = this.db.prepare(
        'SELECT * FROM events WHERE tick >= ? AND tick <= ? ORDER BY id ASC'
      );
      rows = stmt.all(fromTick, toTick) as EventRow[];
    } else {
      const stmt = this.db.prepare(
        'SELECT * FROM events WHERE tick >= ? ORDER BY id ASC'
      );
      rows = stmt.all(fromTick) as EventRow[];
    }

    return rows.map((row) => JSON.parse(row.payload) as SimulationEvent);
  }

  /**
   * Retrieves events filtered by event type.
   */
  public getEventsByType(eventType: SimulationEventType): SimulationEvent[] {
    const stmt = this.db.prepare(
      'SELECT * FROM events WHERE event_type = ? ORDER BY id ASC'
    );
    const rows = stmt.all(eventType) as EventRow[];
    return rows.map((row) => JSON.parse(row.payload) as SimulationEvent);
  }

  /**
   * Retrieves all events associated with a specific agent.
   */
  public getEventsForAgent(agentId: string): SimulationEvent[] {
    const stmt = this.db.prepare(
      'SELECT * FROM events WHERE aggregate_id = ? ORDER BY id ASC'
    );
    const rows = stmt.all(agentId) as EventRow[];
    return rows.map((row) => JSON.parse(row.payload) as SimulationEvent);
  }

  /**
   * Retrieves the latest snapshot available.
   */
  public getLatestSnapshot(): SimulationSnapshot | null {
    const stmt = this.db.prepare(
      'SELECT * FROM snapshots ORDER BY tick DESC LIMIT 1'
    );
    const row = stmt.get() as SnapshotRow | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.state) as SimulationSnapshot;
  }

  /**
   * Retrieves the latest snapshot taken at or before the specified tick.
   */
  public getSnapshotAtOrBefore(tick: number): SimulationSnapshot | null {
    const stmt = this.db.prepare(
      'SELECT * FROM snapshots WHERE tick <= ? ORDER BY tick DESC LIMIT 1'
    );
    const row = stmt.get(tick) as SnapshotRow | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.state) as SimulationSnapshot;
  }

  /**
   * Returns total number of persisted events.
   */
  public getEventCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM events');
    const row = stmt.get() as CountRow | undefined;
    return row ? row.count : 0;
  }

  /**
   * Returns total number of persisted snapshots.
   */
  public getSnapshotCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM snapshots');
    const row = stmt.get() as CountRow | undefined;
    return row ? row.count : 0;
  }

  /**
   * Truncates events and snapshots tables.
   */
  public clear(): void {
    this.db.exec('DELETE FROM events; DELETE FROM snapshots;');
  }

  /**
   * Closes the database connection safely.
   */
  public close(): void {
    this.db.close();
  }
}
