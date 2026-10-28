import { beforeEach, describe, expect, it, vi } from 'vitest';

const exec = vi.hoisted(() => ({ gh: vi.fn(), ghJson: vi.fn() }));
vi.mock('./exec.ts', () => exec);
import { checksOf, findIssueByMarker } from './github.ts';

beforeEach(() => vi.clearAllMocks());

describe('findIssueByMarker', () => {
  it('scans every REST issue page without search indexing', async () => {
    exec.ghJson.mockResolvedValue([
      [{ number: 1, body: 'ordinary issue' }],
      [{ number: 2, body: 'body\n<!-- cubefarm-operation: abc -->' }],
    ]);

    await expect(findIssueByMarker('owner/repo', '<!-- cubefarm-operation: abc -->')).resolves.toBe(2);
    expect(exec.ghJson).toHaveBeenCalledWith([
      'api', '--paginate', '--slurp', 'repos/owner/repo/issues?state=all&per_page=100',
    ]);
  });
});

describe('checksOf', () => {
  it('is none with no rollup', () => {
    expect(checksOf(null)).toBe('none');
    expect(checksOf([])).toBe('none');
  });
  it('is none, never passing, when every check is neutral or skipped', () => {
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'NEUTRAL' }, { name: 'b', status: 'COMPLETED', conclusion: 'SKIPPED' }])).toBe('none');
  });
  it('passes when a real check succeeded alongside skipped ones', () => {
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'b', status: 'COMPLETED', conclusion: 'SKIPPED' }])).toBe('passing');
  });
  it('fails and pends as before', () => {
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'FAILURE' }])).toBe('failing');
    expect(checksOf([{ name: 'a', status: 'IN_PROGRESS' }])).toBe('pending');
  });
});

describe('checksOf never reports passing without a real success', () => {
  for (const conclusion of ['NEUTRAL', 'SKIPPED']) {
    it(`${conclusion} alone is none`, () => {
      expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion }])).toBe('none');
    });
  }
  it('a failure beside a success fails', () => {
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'b', status: 'COMPLETED', conclusion: 'FAILURE' }])).toBe('failing');
  });
  it('a pending check beside a success is pending', () => {
    expect(checksOf([{ name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' }, { name: 'b', status: 'QUEUED' }])).toBe('pending');
  });
});
