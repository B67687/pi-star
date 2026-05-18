type Listener<T extends unknown[]> = (...args: T) => void;

interface ListenerEntry<T extends unknown[]> {
  callback: Listener<T>;
  once: boolean;
}

type EventsMap = Record<string, unknown[]>;

export class TypedEventEmitter<Events extends EventsMap> {
  private _listeners: Map<keyof Events | '*', ListenerEntry<unknown[]>[]> = new Map();
  private _counts: Map<keyof Events | '*', number> = new Map();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    this._addListener(event, listener, false);
    return this;
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    this._addListener(event, listener, true);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    const entries = this._listeners.get(event);
    if (!entries) return this;

    const before = entries.length;
    const filtered = entries.filter(e => e.callback !== listener);
    if (filtered.length === before) return this;

    if (filtered.length === 0) {
      this._listeners.delete(event);
      this._counts.delete(event);
    } else {
      this._listeners.set(event, filtered);
      this._counts.set(event, filtered.length);
    }
    return this;
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const specific = this._listeners.get(event);
    const wildcard = this._listeners.get('*');

    if (!specific && !wildcard) return;

    const specSnapshot: ListenerEntry<unknown[]>[] = specific ? [...specific] : [];
    const wildSnapshot: ListenerEntry<unknown[]>[] = wildcard ? [...wildcard] : [];

    for (const entry of specSnapshot) {
      try {
        entry.callback(...args);
      } catch {
        // Swallow: one listener failing does not stop others.
      }
    }

    for (const entry of wildSnapshot) {
      try {
        entry.callback(event as string, ...args);
      } catch {
        // Swallow.
      }
    }

    // Remove once-listeners for specific event
    if (specific) {
      const remaining = specific.filter(e => !e.once);
      if (remaining.length === 0) {
        this._listeners.delete(event);
        this._counts.delete(event);
      } else {
        this._listeners.set(event, remaining);
        this._counts.set(event, remaining.length);
      }
    }
  }

  listenerCount<K extends keyof Events>(event: K): number {
    return this._counts.get(event) ?? 0;
  }

  removeAll<K extends keyof Events>(event?: K): this {
    if (event === undefined) {
      this._listeners.clear();
      this._counts.clear();
    } else {
      this._listeners.delete(event);
      this._counts.delete(event);
    }
    return this;
  }

  // Register '*' wildcard listener
  onWildcard(listener: Listener<[string, ...unknown[]]>): this {
    this._addListener('*' as keyof Events, listener as Listener<unknown[]>, false);
    return this;
  }

  offWildcard(listener: Listener<[string, ...unknown[]]>): this {
    return this.off('*' as keyof Events, listener as Listener<unknown[]>);
  }

  private _addListener<K extends keyof Events>(
    event: K | '*',
    listener: (...args: unknown[]) => void,
    once: boolean,
  ): void {
    let entries = this._listeners.get(event);
    if (!entries) {
      entries = [];
      this._listeners.set(event, entries);
    }
    entries.push({ callback: listener, once });
    this._counts.set(event, entries.length);
  }
}
