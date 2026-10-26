import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the mic module to avoid isSecureContext checks in tests
vi.mock('./mic', () => ({
  cantListen: vi.fn(() => ''),
  allowMic: vi.fn().mockResolvedValue(''),
  queryMicPermission: vi.fn(),
  micCaps: vi.fn(),
  initSwarmMic: vi.fn(),
}));

vi.mock('./micText', () => ({
  micErrorLine: vi.fn((err: string) => `🎙️ Error: ${err}`),
  MIC_WARMING: 'Starting the mic…',
  MIC_TIMEOUT_MS: 2000,
  MIC_TIMEOUT_MSG: 'Waiting for the browser\'s microphone prompt…',
  MIC_STATUS_CLEANUP_MS: 3000,
}));

describe('handsFree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports listenForVoice function', async () => {
    const { listenForVoice } = await import('./handsFree');
    expect(typeof listenForVoice).toBe('function');
  });

  it('exports handsFreeProblem function', async () => {
    const { handsFreeProblem } = await import('./handsFree');
    expect(typeof handsFreeProblem).toBe('function');
  });

  it('exports setHandsFree function', async () => {
    const { setHandsFree } = await import('./handsFree');
    expect(typeof setHandsFree).toBe('function');
  });

  it('handsFreeProblem returns empty string when provider is browser', async () => {
    const { handsFreeProblem } = await import('./handsFree');
    const problem = handsFreeProblem('browser');
    expect(problem).toBe('');
  });

  it('handsFreeProblem rejects when provider is off', async () => {
    const { handsFreeProblem } = await import('./handsFree');
    const problem = handsFreeProblem('off');
    expect(problem).toContain('enable voice');
  });

  it('setHandsFree with disabled=false returns ok', async () => {
    const { setHandsFree } = await import('./handsFree');
    const result = await setHandsFree(false, 'off');
    expect(result.ok).toBe(true);
  });

  it('listenForVoice rejects when SpeechRecognition not available', async () => {
    // In Node.js test environment, there's no SpeechRecognition API
    // So the function should reject
    const { listenForVoice } = await import('./handsFree');
    const promise = listenForVoice();
    await expect(promise).rejects.toThrow();
  });
});
