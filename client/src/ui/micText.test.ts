import { describe, it, expect, vi, beforeEach } from 'vitest';
import { micErrorLine } from './micText';

// Mock the cantListen function
vi.mock('./mic', () => ({
  cantListen: vi.fn(() => ''),
}));

describe('micErrorLine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps TypeError to secure context message when cantListen returns it', async () => {
    const { cantListen } = await import('./mic');
    vi.mocked(cantListen).mockReturnValue(
      '🎙️ The microphone only works on an HTTPS address or on localhost.',
    );

    const result = micErrorLine('TypeError');
    expect(result).toContain('HTTPS address or on localhost');
  });

  it('maps SecurityError to secure context message when insecure', async () => {
    const { cantListen } = await import('./mic');
    vi.mocked(cantListen).mockReturnValue(
      '🎙️ The microphone only works on an HTTPS address or on localhost.',
    );

    const result = micErrorLine('SecurityError');
    expect(result).toContain('HTTPS address or on localhost');
  });

  it('maps not-allowed error to permission message', () => {
    const result = micErrorLine('not-allowed');
    expect(result).toContain('Microphone blocked');
    expect(result).toContain('Allow it in the address bar');
  });

  it('maps no-speech error', () => {
    const result = micErrorLine('no-speech');
    expect(result).toContain('No speech detected');
  });

  it('maps network error', () => {
    const result = micErrorLine('network-error');
    expect(result).toContain('Network error');
  });

  it('handles Error objects', () => {
    const err = new Error('permission denied');
    const result = micErrorLine(err);
    expect(result).toContain('Microphone blocked');
  });

  it('provides generic fallback for unknown errors', () => {
    const result = micErrorLine('unknown-error-code');
    expect(result).toContain('Listening stopped');
  });
});
