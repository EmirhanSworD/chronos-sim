import { SimulationEngine } from '../core/Engine.js';
import { EventStore } from '../storage/EventStore.js';
declare const app: import("express-serve-static-core").Express;
declare const eventStore: EventStore;
declare const engine: SimulationEngine;
declare let server: import('node:http').Server | null;
export { app, engine, eventStore, server };
//# sourceMappingURL=app.d.ts.map