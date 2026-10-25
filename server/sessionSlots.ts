// Session slots: may one more agent session be reserved under settings.sessionLimit? Pure, so the scheduler can
// recheck it atomically around each start. `active` counts sessions preparing or running. While the CEO is idle one
// slot stays free for it, so workers never crowd the CEO out. Bad input fails closed: no reservation.

/** Who wants the slot: the CEO, or any other agent session (build, QA, fix). */
export type SlotRequester = 'ceo' | 'worker';

export interface SlotRequest {
  /** settings.sessionLimit: most sessions at once; 0 = unlimited. */
  sessionLimit: number;
  /** Sessions preparing or running right now (the CEO's included). */
  active: number;
  /** The CEO has no session preparing or running. */
  ceoIdle: boolean;
  requester: SlotRequester;
}

const count = (n: number) => Number.isInteger(n) && n >= 0;

/** May this requester take one more session slot now? */
export function mayReserveSlot(r: SlotRequest): boolean {
  if (!count(r.sessionLimit) || !count(r.active) || typeof r.ceoIdle !== 'boolean') return false;
  if (r.requester !== 'ceo' && r.requester !== 'worker') return false;
  if (r.sessionLimit === 0) return true;
  const cap = r.requester === 'worker' && r.ceoIdle ? r.sessionLimit - 1 : r.sessionLimit;
  return r.active < cap;
}
