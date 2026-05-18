export type EventMap = Record<string, unknown[]>;

export type Listener<T extends unknown[]> = (...args: T) => void | Promise<void>;

export type EventEmitter<Events extends EventMap> = {
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void;
  on(event: '*', listener: Listener<unknown[]>): () => void;
  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void;
  off(event: '*', listener: Listener<unknown[]>): void;
  emit<K extends keyof Events>(event: K, ...args: Events[K]): void;
  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void;
  listenerCount<K extends keyof Events>(event: K): number;
  listenerCount(event: '*'): number;
  removeAll<K extends keyof Events>(event?: K): void;
};

export function createEventEmitter<Events extends EventMap>(): EventEmitter<Events> {
  const listeners = new Map<keyof Events | '*', Set<Listener<any[]>>>();
  const wildcard = '*' as const;

  function ensureSet(event: keyof Events | '*'): Set<Listener<any[]>> {
    let set = listeners.get(event);
    if (!set) {
      set = new Set();
      listeners.set(event, set);
    }
    return set;
  }

  function on<K extends keyof Events | '*'>(
    event: K,
    listener: Listener<K extends keyof Events ? Events[K] : unknown[]>,
  ): () => void {
    const set = ensureSet(event as keyof Events | '*');
    set.add(listener as Listener<any[]>);
    return () => {
      set.delete(listener as Listener<any[]>);
      if (set.size === 0) {
        listeners.delete(event as keyof Events | '*');
      }
    };
  }

  function off<K extends keyof Events | '*'>(
    event: K,
    listener: Listener<K extends keyof Events ? Events[K] : unknown[]>,
  ): void {
    const set = listeners.get(event as keyof Events | '*');
    if (set) {
      set.delete(listener as Listener<any[]>);
      if (set.size === 0) {
        listeners.delete(event as keyof Events | '*');
      }
    }
  }

  function emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const eventSet = listeners.get(event);
    if (eventSet) {
      for (const listener of eventSet) {
        try {
          (listener as Listener<Events[K]>)(...args);
        } catch {
          // One listener failing must not stop others
        }
      }
    }

    const wildcardSet = listeners.get(wildcard);
    if (wildcardSet) {
      for (const listener of wildcardSet) {
        try {
          (listener as Listener<unknown[]>)(event, ...args);
        } catch {
          // One listener failing must not stop others
        }
      }
    }
  }

  function once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    const wrapper: Listener<Events[K]> = (...args: Events[K]) => {
      off(event, wrapper);
      listener(...args);
    };
    on(event, wrapper);
  }

  function listenerCount<K extends keyof Events | '*'>(event: K): number {
    const set = listeners.get(event as keyof Events | '*');
    return set ? set.size : 0;
  }

  function removeAll<K extends keyof Events>(event?: K): void {
    if (event === undefined) {
      listeners.clear();
    } else {
      listeners.delete(event);
    }
  }

  return { on, off, emit, once, listenerCount, removeAll } as unknown as EventEmitter<Events>;
}
