// Settings → Voice: mic check, provider settings, and voice preferences.

import { useEffect, useState } from 'react';
import { micCaps, queryMicPermission, type MicCaps } from './mic';
import { setHandsFree } from './handsFree';

export function VoiceSettings() {
  const [caps, setCaps] = useState<MicCaps | null>(null);
  const [handsFreeEnabled, setHandsFreeEnabled] = useState(false);

  useEffect(() => {
    const check = async () => {
      const c = micCaps();
      const perm = await queryMicPermission();
      setCaps({ ...c, permission: perm });
    };
    void check();
  }, []);

  const testMic = async () => {
    if (!caps) return;
    const { allowMic } = await import('./mic');
    const result = await allowMic();
    if (result) {
      alert(`Mic check failed: ${result}`);
    } else {
      alert('✅ Microphone working!');
    }
  };

  const handleHandsFreeToggle = async (enabled: boolean) => {
    // TODO: get CEO voice provider from settings/state
    const ceoVoiceProvider = 'off'; // placeholder
    const result = await setHandsFree(enabled, ceoVoiceProvider);
    if (result.ok) {
      setHandsFreeEnabled(enabled);
      if (result.message) alert(result.message);
    } else {
      alert(result.message);
    }
  };

  if (!caps) return <p className="muted">Loading mic check…</p>;

  const permissionState = caps.permission?.state ?? 'unknown';

  return (
    <div className="voice-settings">
      <label className="toggle block">
        <input type="checkbox" checked={handsFreeEnabled} onChange={(e) => void handleHandsFreeToggle(e.target.checked)} />
        <span>🎧 Hands-free mode: listen after each CEO reply and auto-submit</span>
      </label>
      <p className="muted small">After each reply, the office automatically listens for your voice and submits what you say.</p>
      <h4>🎙️ Mic check</h4>
      <table className="mic-check-table">
        <tbody>
          <tr>
            <td>Secure page (HTTPS/localhost)</td>
            <td>{caps.secure ? '✅ Yes' : '❌ No'}</td>
          </tr>
          <tr>
            <td>Speech Recognition API</td>
            <td>{caps.recognition ? '✅ Available' : '❌ Not available'}</td>
          </tr>
          <tr>
            <td>MediaRecorder API</td>
            <td>{caps.recorder ? '✅ Available' : '❌ Not available'}</td>
          </tr>
          <tr>
            <td>Microphone permission</td>
            <td>
              {permissionState === 'granted' && '✅ Granted'}
              {permissionState === 'denied' && '❌ Denied'}
              {permissionState === 'prompt' && '⏳ Not yet asked'}
              {permissionState === 'unknown' && '❓ Unknown'}
            </td>
          </tr>
        </tbody>
      </table>
      <button className="btn btn-small" onClick={testMic}>
        Test mic
      </button>
    </div>
  );
}
