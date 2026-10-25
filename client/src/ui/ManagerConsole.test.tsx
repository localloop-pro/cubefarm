import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// ManagerConsole's imports (sfx, store) touch browser globals at load; a bare stand-in is enough for static markup.
vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>;
  g.window ??= Object.assign(globalThis, { addEventListener: () => {}, removeEventListener: () => {} });
});
import { api } from '../api';
import { SchedulerPauseToggle } from './ManagerConsole';

describe('SchedulerPauseToggle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders unchecked while scheduling runs', () => {
    const html = renderToStaticMarkup(<SchedulerPauseToggle paused={false} />);
    expect(html).toContain('Pause scheduling');
    expect(html).not.toContain('checked');
    expect(html).not.toContain('(paused)');
  });

  it('renders checked while paused', () => {
    const html = renderToStaticMarkup(<SchedulerPauseToggle paused />);
    expect(html).toContain('checked=""');
    expect(html).toContain('(paused)');
  });

  it('writes through the existing settings PATCH', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await api.updateSettings({ schedulerPaused: true });
    expect(fetch).toHaveBeenCalledWith('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedulerPaused: true }),
    });
  });
});
