import type { SimulationEvent, SimulationEventType, SimulationSnapshot } from '../core/Types.js';
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
export declare class EventStore {
    private readonly db;
    private readonly insertEventStmt;
    private readonly insertSnapshotStmt;
    private readonly batchInsertEventsTx;
    private readonly saveSnapshotTx;
    constructor(options?: EventStoreOptions);
    private configurePragmas;
    private initTables;
    private extractAggregateId;
    /**
     * Appends a single event to the database.
     */
    appendEvent(event: SimulationEvent): void;
    /**
     * Appends multiple events in an atomic transaction block.
     */
    appendEvents(events: readonly SimulationEvent[]): void;
    /**
     * Saves a full simulation state snapshot in a transaction block.
     */
    saveSnapshot(snapshot: SimulationSnapshot): void;
    /**
     * Retrieves simulation events within an optional tick range.
     */
    getEvents(fromTick?: number, toTick?: number): SimulationEvent[];
    /**
     * Retrieves events filtered by event type.
     */
    getEventsByType(eventType: SimulationEventType): SimulationEvent[];
    /**
     * Retrieves all events associated with a specific agent.
     */
    getEventsForAgent(agentId: string): SimulationEvent[];
    /**
     * Retrieves the latest snapshot available.
     */
    getLatestSnapshot(): SimulationSnapshot | null;
    /**
     * Retrieves the latest snapshot taken at or before the specified tick.
     */
    getSnapshotAtOrBefore(tick: number): SimulationSnapshot | null;
    /**
     * Returns total number of persisted events.
     */
    getEventCount(): number;
    /**
     * Returns total number of persisted snapshots.
     */
    getSnapshotCount(): number;
    /**
     * Truncates events and snapshots tables.
     */
    clear(): void;
    /**
     * Closes the database connection safely.
     */
    close(): void;
}
//# sourceMappingURL=EventStore.d.ts.map