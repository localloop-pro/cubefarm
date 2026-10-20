// Compatibility helpers for persisted and live office state written by other CubeFarm versions.

import type { AgentRole } from './types.ts';

/** Newer offices call every non-CEO worker an agent; this version calls the same worker a developer. */
export function compatibleAgentRole(role: unknown): AgentRole {
  if (role === 'qa' || role === 'ceo') return role;
  return 'dev';
}
