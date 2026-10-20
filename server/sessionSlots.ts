/**
 * Session-limit arithmetic for the scheduler.
 * Workers leave one slot for the CEO when she is free, so a full floor cannot starve management.
 * CEO jobs themselves ignore the limit (see Swarm.startCeoWork).
 */

/** True when no more worker / QA sessions should start. */
export function workerSlotsFull(limit: number, running: number, ceoBusy: boolean): boolean {
  if (limit <= 0) return false;
  const room = ceoBusy ? limit : Math.max(0, limit - 1);
  return running >= room;
}
