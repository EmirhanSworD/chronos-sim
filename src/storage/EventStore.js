import Database from 'better-sqlite3';
import { vectorKey } from '../core/Types.js';
/**
 * High-Performance Event Store backed by SQLite with WAL (Write-Ahead-Log) mode.
 * Supports transactional appending of events, periodic snapshots, and complete per-tick
 * simulation frames for full deterministic Time-Travel Replay.
 */
export class EventStore {
    db;
    insertEventStmt;
    insertSnapshotStmt;
    insertFrameStmt;
    batchInsertEventsTx;
    saveSnapshotTx;
    saveFrameTx;
    constructor(options) {
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
        this.insertFrameStmt = this.db.prepare(`
      INSERT OR REPLACE INTO simulation_frames (tick, timestamp, agent_count, state)
      VALUES (?, ?, ?, ?)
    `);
        // Prepare transaction blocks
        this.batchInsertEventsTx = this.db.transaction((events) => {
            for (const event of events) {
                const aggregateId = this.extractAggregateId(event);
                const payload = JSON.stringify(event);
                this.insertEventStmt.run(event.tick, event.type, aggregateId, payload, event.timestamp);
            }
        });
        this.saveSnapshotTx = this.db.transaction((snapshot) => {
            const stateJson = JSON.stringify(snapshot);
            this.insertSnapshotStmt.run(snapshot.tick, snapshot.timestamp, snapshot.agents.length, snapshot.obstacles.length, stateJson);
        });
        this.saveFrameTx = this.db.transaction((frame) => {
            const stateJson = JSON.stringify(frame);
            this.insertFrameStmt.run(frame.tick, frame.timestamp, frame.agents.length, stateJson);
        });
    }
    configurePragmas(enableWal) {
        if (enableWal) {
            this.db.pragma('journal_mode = WAL');
        }
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('foreign_keys = ON');
        this.db.pragma('cache_size = -64000'); // 64 MB cache
    }
    initTables() {
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

      CREATE TABLE IF NOT EXISTS simulation_frames (
        tick INTEGER PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        agent_count INTEGER NOT NULL,
        state TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_simulation_frames_tick ON simulation_frames(tick);
    `);
    }
    extractAggregateId(event) {
        switch (event.type) {
            case 'AGENT_SPAWNED':
                return event.agent.id;
            case 'AGENT_DESPAWNED':
            case 'AGENT_MOVED':
            case 'AGENT_STATE_CHANGED':
            case 'PATH_CALCULATED':
            case 'AGENT_REACHED_TARGET':
            case 'AGENT_BLOCKED':
            case 'AGENT_EVADING':
            case 'AGENT_RECHARGING':
            case 'AGENT_EXHAUSTED':
                return event.agentId;
            case 'OBSTACLE_ADDED':
            case 'OBSTACLE_REMOVED':
            case 'CELL_TYPE_CHANGED':
                return vectorKey(event.position);
            case 'THREAT_SPAWNED':
                return event.threat.id;
            case 'THREAT_REMOVED':
                return event.threatId;
            case 'SIMULATION_STARTED':
            case 'SIMULATION_STOPPED':
            case 'SNAPSHOT_CREATED':
                return null;
        }
    }
    // --- Event Persistence ---
    appendEvent(event) {
        const aggregateId = this.extractAggregateId(event);
        const payload = JSON.stringify(event);
        this.insertEventStmt.run(event.tick, event.type, aggregateId, payload, event.timestamp);
    }
    appendEvents(events) {
        if (events.length === 0) {
            return;
        }
        this.batchInsertEventsTx(events);
    }
    // --- Snapshot Persistence ---
    saveSnapshot(snapshot) {
        this.saveSnapshotTx(snapshot);
    }
    // --- Time-Travel Frame Persistence & Queries ---
    /**
     * Serializes and stores a complete simulation frame for a specific tick.
     */
    saveFrame(frame) {
        this.saveFrameTx(frame);
    }
    /**
     * Instantly retrieves the complete simulation frame at an exact historical tick.
     */
    getFrame(tick) {
        const stmt = this.db.prepare('SELECT * FROM simulation_frames WHERE tick = ?');
        const row = stmt.get(tick);
        if (!row) {
            return null;
        }
        return JSON.parse(row.state);
    }
    /**
     * Retrieves a continuous range of historical simulation frames for replay interpolation.
     */
    getHistoryRange(fromTick, toTick) {
        const stmt = this.db.prepare('SELECT * FROM simulation_frames WHERE tick >= ? AND tick <= ? ORDER BY tick ASC');
        const rows = stmt.all(fromTick, toTick);
        return rows.map((row) => JSON.parse(row.state));
    }
    /** Returns total count of recorded simulation frames */
    getFrameCount() {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM simulation_frames');
        const row = stmt.get();
        return row ? row.count : 0;
    }
    /** Retrieves the latest recorded simulation frame */
    getLatestFrame() {
        const stmt = this.db.prepare('SELECT * FROM simulation_frames ORDER BY tick DESC LIMIT 1');
        const row = stmt.get();
        if (!row) {
            return null;
        }
        return JSON.parse(row.state);
    }
    // --- Event Queries ---
    getEvents(fromTick = 0, toTick) {
        let rows;
        if (toTick !== undefined) {
            const stmt = this.db.prepare('SELECT * FROM events WHERE tick >= ? AND tick <= ? ORDER BY id ASC');
            rows = stmt.all(fromTick, toTick);
        }
        else {
            const stmt = this.db.prepare('SELECT * FROM events WHERE tick >= ? ORDER BY id ASC');
            rows = stmt.all(fromTick);
        }
        return rows.map((row) => JSON.parse(row.payload));
    }
    getEventsByType(eventType) {
        const stmt = this.db.prepare('SELECT * FROM events WHERE event_type = ? ORDER BY id ASC');
        const rows = stmt.all(eventType);
        return rows.map((row) => JSON.parse(row.payload));
    }
    getEventsForAgent(agentId) {
        const stmt = this.db.prepare('SELECT * FROM events WHERE aggregate_id = ? ORDER BY id ASC');
        const rows = stmt.all(agentId);
        return rows.map((row) => JSON.parse(row.payload));
    }
    getLatestSnapshot() {
        const stmt = this.db.prepare('SELECT * FROM snapshots ORDER BY tick DESC LIMIT 1');
        const row = stmt.get();
        if (!row) {
            return null;
        }
        return JSON.parse(row.state);
    }
    getSnapshotAtOrBefore(tick) {
        const stmt = this.db.prepare('SELECT * FROM snapshots WHERE tick <= ? ORDER BY tick DESC LIMIT 1');
        const row = stmt.get(tick);
        if (!row) {
            return null;
        }
        return JSON.parse(row.state);
    }
    getEventCount() {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM events');
        const row = stmt.get();
        return row ? row.count : 0;
    }
    getSnapshotCount() {
        const stmt = this.db.prepare('SELECT COUNT(*) as count FROM snapshots');
        const row = stmt.get();
        return row ? row.count : 0;
    }
    clear() {
        this.db.exec('DELETE FROM events; DELETE FROM snapshots; DELETE FROM simulation_frames;');
    }
    close() {
        this.db.close();
    }
}
//# sourceMappingURL=EventStore.js.map