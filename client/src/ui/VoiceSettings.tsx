// Settings → Voice: mic check, provider settings, and voice preferences.

import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { micCaps, queryMicPermission, type MicCaps } from './mic';
import { setHandsFree } from './handsFree';

export function VoiceSettings() {
  const [caps, setCaps] = useState<MicCaps | null>(null);
  const settings = useStore((s) => s.settings);
  const [localHandsFree, setLocalHandsFree] = useState(false);

  useEffect(() => {
    const check = async () => {
      const c = micCaps();
      const perm = await queryMicPermission();
      setCaps({ ...c, permission: perm });
    };
    void check();
  }, []);

  useEffect(() => {
    setLocalHandsFree(settings.handsFreeModeEnabled);
  }, [settings.handsFreeModeEnabled]);

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
    const result = await setHandsFree(enabled, settings.ceoVoiceProvider);
    if (result.ok) {
      setLocalHandsFree(enabled);
      await api.updateSettings({ handsFreeModeEnabled: enabled });
      if (result.message) alert(result.message);
    } else {
      alert(result.message);
    }
  };

  const handleVoiceProviderChange = async (provider: 'off' | 'browser') => {
    await api.updateSettings({ ceoVoiceProvider: provider });
  };

  if (!caps) return <p className="muted">Loading mic check…</p>;

  const permissionState = caps.permission?.state ?? 'unknown';
  const voiceWorking = settings.ceoVoiceProvider === 'browser' && typeof speechSynthesis !== 'undefined';

  return (
    <div className="voice-settings">
      <h4>🎙️ Microphone & Recognition</h4>
      <label className="toggle block">
        <input type="checkbox" checked={localHandsFree} onChange={(e) => void handleHandsFreeToggle(e.target.checked)} />
        <span>🎧 Hands-free mode: listen after each CEO reply and auto-submit</span>
      </label>
      <p className="muted small">After each reply, the office automatically listens for your voice and submits what you say.</p>
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

      <h4>🔊 Voice Provider</h4>
      <label className="toggle block">
        <input
          type="radio"
          name="voiceProvider"
          value="off"
          checked={settings.ceoVoiceProvider === 'off'}
          onChange={() => void handleVoiceProviderChange('off')}
        />
        <span>Off: silent replies</span>
      </label>
      <label className="toggle block">
        <input
          type="radio"
          name="voiceProvider"
          value="browser"
          checked={settings.ceoVoiceProvider === 'browser'}
          onChange={() => void handleVoiceProviderChange('browser')}
        />
        <span>Browser: use this device's speech synthesis ({voiceWorking ? '✅ Available' : '❌ Not available'})</span>
      </label>
    </div>
  );
}
