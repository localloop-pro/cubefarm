// Settings → Voice: mic check, provider settings, and voice preferences.

import { useEffect, useState } from 'react';
import { micCaps, queryMicPermission, type MicCaps } from './mic';

export function VoiceSettings() {
  const [caps, setCaps] = useState<MicCaps | null>(null);

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

  if (!caps) return <p className="muted">Loading mic check…</p>;

  const permissionState = caps.permission?.state ?? 'unknown';

  return (
    <div className="voice-settings">
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
