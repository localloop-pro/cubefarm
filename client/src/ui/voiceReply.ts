// Browser speech synthesis for CEO voice replies.

/** Speak the CEO's reply using browser speech synthesis. */
export async function playVoiceReply(text: string, provider: 'off' | 'browser'): Promise<void> {
  if (provider === 'off') return;

  try {
    if (!window.speechSynthesis) {
      console.warn('Speech synthesis not available');
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('Voice reply error:', e instanceof Error ? e.message : String(e));
  }
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
