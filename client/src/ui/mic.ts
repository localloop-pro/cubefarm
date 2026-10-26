// Browser microphone and speech recognition capabilities and state.

export interface MicCaps {
  secure: boolean;
  recognition: boolean;
  recorder: boolean;
  permission: PermissionStatus | undefined;
}

/** Current microphone capabilities and permission state. */
export function micCaps(): MicCaps {
  const secure = window.isSecureContext;
  const recognition =
    typeof (window as any).webkitSpeechRecognition !== 'undefined' || typeof (window as any).SpeechRecognition !== 'undefined';
  return {
    secure,
    recognition,
    recorder: typeof MediaRecorder !== 'undefined',
    permission: undefined, // Will be queried asynchronously if needed
  };
}

/** Reason the microphone cannot be used, or '' if OK. */
export function cantListen(): string {
  const caps = micCaps();
  if (!caps.secure) {
    return '🎙️ The microphone only works on an HTTPS address or on localhost. Open the office as http://localhost:PORT on this Mac, or over HTTPS (Tailscale Serve, see docs/pocket.md).';
  }
  return '';
}

/** Query the current microphone permission state. */
export async function queryMicPermission(): Promise<PermissionStatus | undefined> {
  try {
    if (!navigator.permissions?.query) return undefined;
    return await navigator.permissions.query({ name: 'microphone' } as PermissionDescriptor);
  } catch {
    return undefined;
  }
}

/** Request microphone access and report why it might fail. */
export async function allowMic(): Promise<string> {
  const issue = cantListen();
  if (issue) return issue;

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      return cantListen() || '🎙️ The microphone API is not available.';
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop all tracks immediately after permission check
    stream.getTracks().forEach((track) => track.stop());
    return '';
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    if (err.includes('permission') || err.includes('denied')) {
      return "🎙️ Microphone blocked. Allow it in the address bar's permission icon.";
    }
    if (err.includes('NotFoundError')) {
      return '🎙️ No microphone device found.';
    }
    if (err.includes('TypeError')) {
      return cantListen() || '🎙️ The microphone API is not available.';
    }
    return `🎙️ Microphone error: ${err}`;
  }
}

/** Global mic state for debugging and testing. */
export interface SwarmMic {
  secure: boolean;
  permission?: PermissionStatus;
}

/** Expose mic state to the window for testing/debugging. */
export function initSwarmMic() {
  const caps = micCaps();
  const mic: SwarmMic = {
    secure: caps.secure,
  };
  window.__swarmMic = mic;
  // Update permission state asynchronously
  queryMicPermission().then((p) => {
    mic.permission = p;
  });
}

declare global {
  interface Window {
    __swarmMic?: SwarmMic;
    webkitSpeechRecognition?: any;
  }
}
