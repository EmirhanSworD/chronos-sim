/**
 * Generic Type-Safe Finite State Machine.
 * Enforces transition validity at compile-time and run-time with guards and lifecycle hooks.
 */
export class StateMachine {
    currentState;
    context;
    transitions = new Map();
    enterListeners = new Map();
    exitListeners = new Map();
    anyTransitionListeners = [];
    constructor(initialState, initialContext) {
        this.currentState = initialState;
        this.context = initialContext;
    }
    /**
     * Registers a valid transition rule between states.
     */
    addTransition(from, trigger, to, guard) {
        const key = `${from}->${trigger}`;
        let rules = this.transitions.get(key);
        if (!rules) {
            rules = [];
            this.transitions.set(key, rules);
        }
        rules.push({ from, trigger, to, guard });
        return this;
    }
    /** Current state */
    get state() {
        return this.currentState;
    }
    /** Current state context */
    get currentContext() {
        return this.context;
    }
    /**
     * Checks whether a trigger is valid and executable from the current state.
     */
    canTrigger(trigger) {
        const key = `${this.currentState}->${trigger}`;
        const rules = this.transitions.get(key);
        if (!rules || rules.length === 0) {
            return false;
        }
        return rules.some((rule) => !rule.guard || rule.guard(this.context));
    }
    /**
     * Attempts to execute a state transition.
     */
    trigger(trigger, reason) {
        const key = `${this.currentState}->${trigger}`;
        const rules = this.transitions.get(key);
        if (!rules || rules.length === 0) {
            return {
                success: false,
                from: this.currentState,
                to: this.currentState,
                trigger,
                reason: `Invalid transition: Trigger '${trigger}' not allowed in state '${this.currentState}'`,
            };
        }
        const matchedRule = rules.find((r) => !r.guard || r.guard(this.context));
        if (!matchedRule) {
            return {
                success: false,
                from: this.currentState,
                to: this.currentState,
                trigger,
                reason: `Guard condition rejected transition '${trigger}' from '${this.currentState}'`,
            };
        }
        const previous = this.currentState;
        const next = matchedRule.to;
        // Fire exit listeners
        const exitList = this.exitListeners.get(previous);
        if (exitList) {
            for (const fn of exitList) {
                fn(previous, next, this.context, reason);
            }
        }
        this.currentState = next;
        // Fire enter listeners
        const enterList = this.enterListeners.get(next);
        if (enterList) {
            for (const fn of enterList) {
                fn(previous, next, this.context, reason);
            }
        }
        // Fire generic transition listeners
        for (const fn of this.anyTransitionListeners) {
            fn(previous, next, this.context, reason);
        }
        return {
            success: true,
            from: previous,
            to: next,
            trigger,
            reason,
        };
    }
    /** Adds listener invoked when entering a specific state */
    onEnter(state, listener) {
        let list = this.enterListeners.get(state);
        if (!list) {
            list = [];
            this.enterListeners.set(state, list);
        }
        list.push(listener);
        return this;
    }
    /** Adds listener invoked when exiting a specific state */
    onExit(state, listener) {
        let list = this.exitListeners.get(state);
        if (!list) {
            list = [];
            this.exitListeners.set(state, list);
        }
        list.push(listener);
        return this;
    }
    /** Adds listener invoked on any successful state change */
    onTransition(listener) {
        this.anyTransitionListeners.push(listener);
        return this;
    }
}
/**
 * Type-Safe Agent State Machine
 * Manages states: IDLE, PATROL, NAVIGATING, EVADING, RECHARGING, EXHAUSTED, BLOCKED, COMPLETED
 */
export class AgentStateMachine {
    fsm;
    constructor(agentId, initialState = 'IDLE') {
        this.fsm = new StateMachine(initialState, { agentId });
        this.setupTransitions();
    }
    setupTransitions() {
        // --- From IDLE ---
        this.fsm.addTransition('IDLE', 'START_NAVIGATION', 'NAVIGATING');
        this.fsm.addTransition('IDLE', 'START_PATROL', 'PATROL');
        this.fsm.addTransition('IDLE', 'EVADE_THREAT', 'EVADING');
        this.fsm.addTransition('IDLE', 'SEEK_RECHARGE', 'RECHARGING');
        this.fsm.addTransition('IDLE', 'EXHAUST', 'EXHAUSTED');
        this.fsm.addTransition('IDLE', 'OBSTACLE_BLOCKED', 'BLOCKED');
        this.fsm.addTransition('IDLE', 'RESET', 'IDLE');
        // --- From PATROL ---
        this.fsm.addTransition('PATROL', 'EVADE_THREAT', 'EVADING');
        this.fsm.addTransition('PATROL', 'SEEK_RECHARGE', 'RECHARGING');
        this.fsm.addTransition('PATROL', 'OBSTACLE_BLOCKED', 'BLOCKED');
        this.fsm.addTransition('PATROL', 'START_NAVIGATION', 'NAVIGATING');
        this.fsm.addTransition('PATROL', 'START_PATROL', 'PATROL');
        this.fsm.addTransition('PATROL', 'EXHAUST', 'EXHAUSTED');
        this.fsm.addTransition('PATROL', 'STOP', 'IDLE');
        this.fsm.addTransition('PATROL', 'RESET', 'IDLE');
        // --- From NAVIGATING ---
        this.fsm.addTransition('NAVIGATING', 'EVADE_THREAT', 'EVADING');
        this.fsm.addTransition('NAVIGATING', 'SEEK_RECHARGE', 'RECHARGING');
        this.fsm.addTransition('NAVIGATING', 'OBSTACLE_BLOCKED', 'BLOCKED');
        this.fsm.addTransition('NAVIGATING', 'TARGET_REACHED', 'COMPLETED');
        this.fsm.addTransition('NAVIGATING', 'START_NAVIGATION', 'NAVIGATING');
        this.fsm.addTransition('NAVIGATING', 'START_PATROL', 'PATROL');
        this.fsm.addTransition('NAVIGATING', 'EXHAUST', 'EXHAUSTED');
        this.fsm.addTransition('NAVIGATING', 'STOP', 'IDLE');
        this.fsm.addTransition('NAVIGATING', 'RESET', 'IDLE');
        // --- From EVADING ---
        this.fsm.addTransition('EVADING', 'EVADE_THREAT', 'EVADING');
        this.fsm.addTransition('EVADING', 'SEEK_RECHARGE', 'RECHARGING');
        this.fsm.addTransition('EVADING', 'START_PATROL', 'PATROL');
        this.fsm.addTransition('EVADING', 'START_NAVIGATION', 'NAVIGATING');
        this.fsm.addTransition('EVADING', 'EXHAUST', 'EXHAUSTED');
        this.fsm.addTransition('EVADING', 'STOP', 'IDLE');
        this.fsm.addTransition('EVADING', 'RESET', 'IDLE');
        // --- From RECHARGING ---
        this.fsm.addTransition('RECHARGING', 'EVADE_THREAT', 'EVADING');
        this.fsm.addTransition('RECHARGING', 'RECHARGE_COMPLETE', 'IDLE');
        this.fsm.addTransition('RECHARGING', 'START_PATROL', 'PATROL');
        this.fsm.addTransition('RECHARGING', 'START_NAVIGATION', 'NAVIGATING');
        this.fsm.addTransition('RECHARGING', 'EXHAUST', 'EXHAUSTED');
        this.fsm.addTransition('RECHARGING', 'STOP', 'IDLE');
        this.fsm.addTransition('RECHARGING', 'RESET', 'IDLE');
        // --- From EXHAUSTED ---
        this.fsm.addTransition('EXHAUSTED', 'SEEK_RECHARGE', 'RECHARGING');
        this.fsm.addTransition('EXHAUSTED', 'RESET', 'IDLE');
        // --- From BLOCKED ---
        this.fsm.addTransition('BLOCKED', 'EVADE_THREAT', 'EVADING');
        this.fsm.addTransition('BLOCKED', 'PATH_RESOLVED', 'NAVIGATING');
        this.fsm.addTransition('BLOCKED', 'START_NAVIGATION', 'NAVIGATING');
        this.fsm.addTransition('BLOCKED', 'START_PATROL', 'PATROL');
        this.fsm.addTransition('BLOCKED', 'SEEK_RECHARGE', 'RECHARGING');
        this.fsm.addTransition('BLOCKED', 'EXHAUST', 'EXHAUSTED');
        this.fsm.addTransition('BLOCKED', 'STOP', 'IDLE');
        this.fsm.addTransition('BLOCKED', 'RESET', 'IDLE');
        // --- From COMPLETED ---
        this.fsm.addTransition('COMPLETED', 'START_NAVIGATION', 'NAVIGATING');
        this.fsm.addTransition('COMPLETED', 'START_PATROL', 'PATROL');
        this.fsm.addTransition('COMPLETED', 'SEEK_RECHARGE', 'RECHARGING');
        this.fsm.addTransition('COMPLETED', 'EVADE_THREAT', 'EVADING');
        this.fsm.addTransition('COMPLETED', 'RESET', 'IDLE');
        this.fsm.addTransition('COMPLETED', 'STOP', 'IDLE');
    }
    get state() {
        return this.fsm.state;
    }
    canTransition(trigger) {
        return this.fsm.canTrigger(trigger);
    }
    startNavigation(reason) {
        return this.fsm.trigger('START_NAVIGATION', reason);
    }
    startPatrol(reason) {
        return this.fsm.trigger('START_PATROL', reason);
    }
    evadeThreat(reason) {
        return this.fsm.trigger('EVADE_THREAT', reason);
    }
    seekRecharge(reason) {
        return this.fsm.trigger('SEEK_RECHARGE', reason);
    }
    rechargeComplete(reason) {
        return this.fsm.trigger('RECHARGE_COMPLETE', reason);
    }
    exhaust(reason) {
        return this.fsm.trigger('EXHAUST', reason);
    }
    block(reason) {
        return this.fsm.trigger('OBSTACLE_BLOCKED', reason);
    }
    resolvePath(reason) {
        return this.fsm.trigger('PATH_RESOLVED', reason);
    }
    reachTarget(reason) {
        return this.fsm.trigger('TARGET_REACHED', reason);
    }
    stop(reason) {
        return this.fsm.trigger('STOP', reason);
    }
    reset(reason) {
        return this.fsm.trigger('RESET', reason);
    }
    onTransition(listener) {
        this.fsm.onTransition(listener);
        return this;
    }
}
//# sourceMappingURL=StateMachine.js.map