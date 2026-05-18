# Event Emitter Spec

## Interface

```typescript
type MyEvents = {
  data: (payload: string) => void;
  error: (code: number, message: string) => void;
};

const ee = new EventEmitter<MyEvents>();

ee.on("data", (payload) => console.log(payload));
ee.on("*", (event, ...args) => console.log(`Event: ${event}`, args));
ee.emit("data", "hello");
```

## Requirements

1. **Typed**: Generic `EventEmitter<T>` where `T` maps event names to listener signatures
2. **on/off**: Subscribe and unsubscribe by event name
3. **emit**: Call all listeners with spread args
4. **once**: Auto-unsubscribe after first emit
5. **Wildcard '*':** Catches all events, receives event name as first arg
6. **Listener tracking**: `ee.listenerCount("data")` returns number of listeners
7. **Error isolation**: If one listener throws, others still fire
8. **removeAll**: Clear all listeners for one event or all events
9. **Return unsubscribe function**: `ee.on("data", fn)` returns a function that unsubscribes
