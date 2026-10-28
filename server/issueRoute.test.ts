import { describe, expect, it, vi } from 'vitest';
import { createIssueFromApi } from './issueRoute.ts';

function creator() {
  return { createIssue: vi.fn(async () => 42) };
}

describe('issue API idempotency key validation', () => {
  it.each([
    ['omitted', {}],
    ['null', { idempotencyKey: null }],
    ['empty', { idempotencyKey: '' }],
    ['whitespace-only', { idempotencyKey: '   ' }],
  ])('supports a generated-key request when the field is %s', async (_name, keyBody) => {
    const swarm = creator();
    await expect(createIssueFromApi(swarm, 'owner/repo', { title: 'Task', body: 'Body', ...keyBody })).resolves.toBe(42);
    expect(swarm.createIssue).toHaveBeenCalledOnce();
    expect(swarm.createIssue).toHaveBeenCalledWith('owner/repo', 'Task', 'Body', undefined, undefined, undefined);
  });

  it('trims and forwards a valid supplied key', async () => {
    const swarm = creator();
    await expect(createIssueFromApi(swarm, 'owner/repo', { title: 'Task', body: 'Body', idempotencyKey: '  caller-key-0001  ' })).resolves.toBe(42);
    expect(swarm.createIssue).toHaveBeenCalledWith('owner/repo', 'Task', 'Body', undefined, undefined, 'caller-key-0001');
  });

  it.each([
    ['malformed string', 'bad!'],
    ['short string', 'short'],
    ['number', 12345678],
    ['object', { key: 'caller-key-0001' }],
    ['array', ['caller-key-0001']],
    ['true', true],
    ['false', false],
  ])('rejects a supplied %s before invoking the issue writer', async (_name, idempotencyKey) => {
    const swarm = creator();
    const result = createIssueFromApi(swarm, 'owner/repo', { title: 'Task', body: 'Body', idempotencyKey });
    await expect(result).rejects.toMatchObject({ status: 400, message: 'Invalid idempotency key' });
    expect(swarm.createIssue).not.toHaveBeenCalled();
  });
});
