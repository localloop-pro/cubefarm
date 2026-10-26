import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { playVoiceReply, stopVoiceReply } from './voiceReply';

describe('voiceReply', () => {
  let onendHandler: ((e: Event) => void) | null = null;
  let onerrorHandler: ((e: Event) => void) | null = null;
  let cancelCalls: number;

  beforeEach(() => {
    onendHandler = null;
    onerrorHandler = null;
    cancelCalls = 0;

    // Mock SpeechSynthesisUtterance
    class MockUtterance {
      onend: ((e: Event) => void) | null = null;
      onerror: ((e: Event) => void) | null = null;
      rate = 1;
      pitch = 1;
      volume = 1;

      constructor(_text: string) {}
    }

    (global as any).SpeechSynthesisUtterance = MockUtterance;

    // Mock speechSynthesis
    (global as any).speechSynthesis = {
      cancel: vi.fn(() => {
        cancelCalls++;
      }),
      speak: vi.fn((utterance: any) => {
        onendHandler = utterance.onend;
        onerrorHandler = utterance.onerror;
      }),
      pending: false,
      speaking: false,
    };

    // Mock window
    (global as any).window = {
      speechSynthesis: (global as any).speechSynthesis,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns "skipped" when provider is "off"', async () => {
    const outcome = await playVoiceReply('test', 'off');
    expect(outcome).toBe('skipped');
  });

  it('returns "unavailable" when speechSynthesis is not available', async () => {
    (global as any).window.speechSynthesis = undefined;
    const outcome = await playVoiceReply('test', 'browser');
    expect(outcome).toBe('unavailable');
  });

  it('returns "played" when utterance ends normally', async () => {
    const promise = playVoiceReply('test', 'browser');
    expect((global as any).speechSynthesis.speak).toHaveBeenCalled();

    // Simulate normal completion
    if (onendHandler) {
      onendHandler(new Event('end'));
    }

    const outcome = await promise;
    expect(outcome).toBe('played');
  });

  it('returns "error" when utterance fires onerror', async () => {
    const promise = playVoiceReply('test', 'browser');

    // Simulate error
    if (onerrorHandler) {
      onerrorHandler(new Event('error'));
    }

    const outcome = await promise;
    expect(outcome).toBe('error');
  });

  it('returns "error" on exception during setup', async () => {
    // Make SpeechSynthesisUtterance throw
    (global as any).SpeechSynthesisUtterance = vi.fn(() => {
      throw new Error('test error');
    });

    const outcome = await playVoiceReply('test', 'browser');
    expect(outcome).toBe('error');
  });

  it('returns "cancelled" when stopVoiceReply is called before completion', async () => {
    const promise = playVoiceReply('test', 'browser');

    // Call stopVoiceReply to set the cancellation flag
    stopVoiceReply();
    expect((global as any).speechSynthesis.cancel).toHaveBeenCalled();

    // Simulate the onend callback after cancellation
    if (onendHandler) {
      onendHandler(new Event('end'));
    }

    const outcome = await promise;
    expect(outcome).toBe('cancelled');
  });

  it('handles multiple callbacks without settling twice', async () => {
    const promise = playVoiceReply('test', 'browser');

    // First error
    if (onerrorHandler) {
      onerrorHandler(new Event('error'));
    }

    // Second error (should not cause issues)
    if (onerrorHandler) {
      onerrorHandler(new Event('error'));
    }

    const outcome = await promise;
    expect(outcome).toBe('error');
  });

  it('cancels previous speech before speaking new text', async () => {
    const promise = playVoiceReply('first', 'browser');
    expect(cancelCalls).toBe(1);

    // Simulate completion
    if (onendHandler) {
      onendHandler(new Event('end'));
    }

    await promise;

    // Reset for next call
    const prevCancelCalls = cancelCalls;
    let handler2: ((e: Event) => void) | null;

    // Start new speech
    const promise2 = playVoiceReply('second', 'browser');
    handler2 = onendHandler;
    expect(cancelCalls).toBe(prevCancelCalls + 1);

    if (handler2) {
      handler2(new Event('end'));
    }

    const outcome = await promise2;
    expect(outcome).toBe('played');
  });
});
