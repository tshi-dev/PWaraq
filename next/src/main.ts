import { mount } from 'svelte';
import './styles/tokens.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

// Web build only (the desktop app has its own files): the worker makes the app open offline after one visit.
if (import.meta.env.PROD && 'serviceWorker' in navigator && !(globalThis as { __TAURI__?: unknown }).__TAURI__) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
}
