// Browser speech synthesis for CEO voice replies.

/** Speak the CEO's reply using browser speech synthesis and return a promise that resolves when done. */
export function playVoiceReply(text: string, provider: 'off' | 'browser'): Promise<void> {
  return new Promise((resolve) => {
    if (provider === 'off') {
      resolve();
      return;
    }

    try {
      if (!window.speechSynthesis) {
        console.warn('Speech synthesis not available');
        resolve();
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onend = () => {
        resolve();
      };

      utterance.onerror = () => {
        resolve();
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Voice reply error:', e instanceof Error ? e.message : String(e));
      resolve();
    }
  });
}

/** Stop any ongoing voice reply. */
export function stopVoiceReply(): void {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/** Check if voice synthesis is currently speaking. */
export function isVoiceSpeaking(): boolean {
  return window.speechSynthesis?.speaking ?? false;
}
