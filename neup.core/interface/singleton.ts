/**
 * Describes a class that exposes a shared singleton instance.
 *
 * This contract is intentionally generic and contains no project-specific logic.
 */
export interface SingletonProvider<T> {
    getInstance(): T;
}

/**
 * Generic singleton base class.
 *
 * Subclasses can call `instanceFor()` inside their own static `getInstance()`
 * implementation to get one shared instance per subclass type.
 */
export abstract class Singleton {
    private static readonly instances = new Map<Function, unknown>();

    protected constructor() {}

    protected static instanceFor<T>(this: new () => T): T {
        const cached = Singleton.instances.get(this) as T | undefined;
        if (cached) {
            return cached;
        }

        const created = new this();
        Singleton.instances.set(this, created);
        return created;
    }
}