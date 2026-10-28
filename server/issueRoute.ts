import type { Swarm } from './swarm.ts';
import { apiIssueIdempotencyKey } from './issueIdempotency.ts';

type IssueCreator = Pick<Swarm, 'createIssue'>;

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Validate the raw HTTP body before handing the request to Swarm's durable issue writer. */
export async function createIssueFromApi(creator: IssueCreator, repoId: string, rawBody: unknown): Promise<number> {
  const body = record(rawBody);
  const idempotencyKey = apiIssueIdempotencyKey(body.idempotencyKey);
  return creator.createIssue(
    repoId,
    text(body.title),
    text(body.body),
    text(body.assignTo) || undefined,
    text(body.specialty) || undefined,
    idempotencyKey,
  );
}
