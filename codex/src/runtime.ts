// Narrow adapter for the engine operations used by the original Claude mod.
// This module is bundled into pal.mjs, once per isolated session import.
export type EngineInterface = any;
export type Register = (on: any, options: any) => void;
export const atom = (address: { key: string }, initial: unknown) => ({
  key: address.key,
  initial,
});
export async function read(engine: any, ref: any) {
  return engine.state.has(ref.key)
    ? engine.state.get(ref.key)
    : structuredClone(ref.initial);
}
export async function update(engine: any, ref: any, fn: (value: any) => any) {
  engine.state.set(ref.key, fn(await read(engine, ref)));
}
