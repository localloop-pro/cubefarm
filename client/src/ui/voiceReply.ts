// Browser speech synthesis for CEO voice replies.

export type VoiceReplyOutcome = 'played' | 'skipped' | 'cancelled' | 'error' | 'unavailable';

let currentUtterance: SpeechSynthesisUtterance | null = null;
let wasCancelled = false;

/** Speak the CEO's reply using browser speech synthesis and return the outcome. */
export function playVoiceReply(text: string, provider: 'off' | 'browser'): Promise<VoiceReplyOutcome> {
  return new Promise((resolve) => {
    if (provider === 'off') {
      resolve('skipped');
      return;
    }

    try {
      if (!window.speechSynthesis) {
        console.warn('Speech synthesis not available');
        resolve('unavailable');
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      wasCancelled = false;

      const utterance = new SpeechSynthesisUtterance(text);
      currentUtterance = utterance;
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      let settled = false;

      utterance.onend = () => {
        if (!settled) {
          settled = true;
          const outcome = wasCancelled ? 'cancelled' : 'played';
          resolve(outcome);
          if (currentUtterance === utterance) {
            currentUtterance = null;
          }
        }
      };

      utterance.onerror = () => {
        if (!settled) {
          settled = true;
          resolve('error');
          if (currentUtterance === utterance) {
            currentUtterance = null;
          }
        }
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Voice reply error:', e instanceof Error ? e.message : String(e));
      resolve('error');
    }
  });
}

/** Stop any ongoing voice reply. */
export function stopVoiceReply(): void {
  if (window.speechSynthesis) {
    wasCancelled = true;
    window.speechSynthesis.cancel();
  }
}

/** Check if voice synthesis is currently speaking. */
export function isVoiceSpeaking(): boolean {
  return window.speechSynthesis?.speaking ?? false;
}
