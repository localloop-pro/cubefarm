import { createRoot } from 'react-dom/client';
import { App } from './App';
import { connect } from './net';
import { useStore } from './store';
import { initSwarmMic } from './ui/mic';
import './styles.css';

connect();
initSwarmMic();
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__swarmStore = useStore;
createRoot(document.getElementById('root')!).render(<App />);
