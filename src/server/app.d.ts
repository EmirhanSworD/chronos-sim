import { SimulationEngine } from '../core/Engine.js';
import { EventStore } from '../storage/EventStore.js';
declare const app: import("express-serve-static-core").Express;
declare const eventStore: EventStore;
declare const engine: SimulationEngine;
export { app, engine, eventStore };
//# sourceMappingURL=app.d.ts.map