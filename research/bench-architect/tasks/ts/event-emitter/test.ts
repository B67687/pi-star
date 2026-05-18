// Tests for event-emitter.ts
import { EventEmitter } from './solution.js';

// ── Basic subscribe/emit ──
{
  const ee = new EventEmitter<{ data: (s: string) => void }>();
  let called = false;
  ee.on("data", (s) => { called = true; });
  ee.emit("data", "hello");
  console.assert(called, "✓ on/emit works");
  if (!called) process.exit(1);
}

// ── Unsubscribe ──
{
  const ee = new EventEmitter<{ data: () => void }>();
  let count = 0;
  const fn = () => { count++; };
  ee.on("data", fn);
  ee.off("data", fn);
  ee.emit("data");
  console.assert(count === 0, "✓ off works");
  if (count !== 0) process.exit(1);
}

// ── Once ──
{
  const ee = new EventEmitter<{ data: () => void }>();
  let count = 0;
  ee.once("data", () => { count++; });
  ee.emit("data");
  ee.emit("data");
  console.assert(count === 1, "✓ once fires once only");
  if (count !== 1) process.exit(1);
}

// ── Wildcard '*' ──
{
  const ee = new EventEmitter<{ foo: (x: number) => void }>();
  const events: string[] = [];
  ee.on("*", (event: string, ...args: any[]) => { events.push(event); });
  ee.emit("foo", 42);
  console.assert(events.length === 1 && events[0] === "foo", "✓ wildcard catches events");
  if (events.length !== 1 || events[0] !== "foo") process.exit(1);
}

// ── Listener count ──
{
  const ee = new EventEmitter<{ data: () => void }>();
  console.assert(ee.listenerCount("data") === 0, "✓ initial count is 0");
  ee.on("data", () => {});
  console.assert(ee.listenerCount("data") === 1, "✓ count after subscribe is 1");
}

// ── Error isolation ──
{
  const ee = new EventEmitter<{ data: () => void }>();
  let secondCalled = false;
  ee.on("data", () => { throw new Error("fail"); });
  ee.on("data", () => { secondCalled = true; });
  ee.emit("data");
  console.assert(secondCalled, "✓ error in one listener doesn't prevent others");
  if (!secondCalled) process.exit(1);
}

// ── Remove all ──
{
  const ee = new EventEmitter<{ a: () => void; b: () => void }>();
  let count = 0;
  ee.on("a", () => { count++; });
  ee.on("b", () => { count++; });
  ee.removeAll("a");
  ee.emit("a");
  ee.emit("b");
  console.assert(count === 1, "✓ removeAll clears specific event");
  if (count !== 1) process.exit(1);
}

// ── Return unsubscribe function ──
{
  const ee = new EventEmitter<{ data: () => void }>();
  let count = 0;
  const unsub = ee.on("data", () => { count++; });
  unsub();
  ee.emit("data");
  console.assert(count === 0, "✓ unsubscribe function works");
  if (count !== 0) process.exit(1);
}

console.log("\nAll tests passed ✓");
