import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createProductionAdapters } from './runtime';

const root = document.getElementById('root');
if (!root) throw new Error('Lease Generator root element is missing.');

try {
  createRoot(root).render(<StrictMode><App adapters={createProductionAdapters()} /></StrictMode>);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  root.innerHTML = `<main style="font:16px system-ui;padding:32px;max-width:720px;margin:auto"><h1>Lease Generator unavailable</h1><p>${escapeHtml(message)}</p></main>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/gu, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[character] ?? character);
}
