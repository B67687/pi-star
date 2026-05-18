type EventMap = Record<string, any[]>;

type ListenerEntry = {
  original: (...args: any[]) => void;
  wrapper: (...args: any[]) => void;
  once: boolean;
};

export class EventEmitter<Events extends EventMap> {
  private _listeners: Map<string, ListenerEntry[]> = new Map();

  on<E extends string & keyof Events>(event: E, listener: (...args: Events[E]) => void): () => void;
  on(event: '*', listener: (type: string, ...args: any[]) => void): () => void;
  on(event: string, listener: (...args: any[]) => void): () => void {
    const entries = this._getOrCreate(event);
    entries.push({ original: listener, wrapper: listener, once: false });
    return () => {
      this.off(event, listener);
    };
  }

  once<E extends string & keyof Events>(event: E, listener: (...args: Events[E]) => void): this;
  once(event: '*', listener: (type: string, ...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this {
    const self = this;
    const wrapper = (...args: any[]) => {
      self.off(event, wrapper);
      listener(...args);
    };
    const entries = this._getOrCreate(event);
    entries.push({ original: listener, wrapper, once: true });
    return this;
  }

  off<E extends string & keyof Events>(event: E, listener: (...args: Events[E]) => void): this;
  off(event: '*', listener: (type: string, ...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this {
    const entries = this._listeners.get(event);
    if (!entries) return this;
    const idx = entries.findIndex(e => e.original === listener || e.wrapper === listener);
    if (idx === -1) return this;
    entries.splice(idx, 1);
    if (entries.length === 0) {
      this._listeners.delete(event);
    }
    return this;
  }

  emit<E extends string & keyof Events>(event: E, ...args: Events[E]): boolean {
    return this._emit(event as string, args);
  }

  listenerCount(event: string & keyof Events | '*'): number {
    const entries = this._listeners.get(event);
    return entries ? entries.length : 0;
  }

  removeAll(): this;
  removeAll(event: string & keyof Events | '*'): this;
  removeAll(event?: string): this {
    if (event === undefined) {
      this._listeners.clear();
    } else {
      this._listeners.delete(event);
    }
    return this;
  }

  eventNames(): (string & keyof Events | '*')[] {
    return Array.from(this._listeners.keys()) as (string & keyof Events | '*')[];
  }

  private _emit(event: string, args: any[]): boolean {
    let hasListeners = false;

    const wildcardEntries = this._listeners.get('*');
    if (wildcardEntries && wildcardEntries.length > 0) {
      hasListeners = true;
      for (const entry of [...wildcardEntries]) {
        try {
          entry.wrapper(event, ...args);
        } catch (_) {
          // swallow: one listener failing does not stop others
        }
        if (entry.once) {
          this._removeEntry('*', entry);
        }
      }
    }

    const entries = this._listeners.get(event);
    if (entries && entries.length > 0) {
      hasListeners = true;
      for (const entry of [...entries]) {
        try {
          entry.wrapper(...args);
        } catch (_) {
          // swallow: one listener failing does not stop others
        }
        if (entry.once) {
          this._removeEntry(event, entry);
        }
      }
    }

    return hasListeners;
  }

  private _removeEntry(event: string, entry: ListenerEntry): void {
    const entries = this._listeners.get(event);
    if (!entries) return;
    const idx = entries.indexOf(entry);
    if (idx === -1) return;
    entries.splice(idx, 1);
    if (entries.length === 0) {
      this._listeners.delete(event);
    }
  }

  private _getOrCreate(event: string): ListenerEntry[] {
    let entries = this._listeners.get(event);
    if (!entries) {
      entries = [];
      this._listeners.set(event, entries);
    }
    return entries;
  }
}

export default EventEmitter;
