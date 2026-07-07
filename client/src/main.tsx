import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

const productionHost = 'meetflow-ai-client.vercel.app';
const isVercelPreviewHost =
  window.location.hostname.endsWith('nobihu21s-projects.vercel.app') ||
  /^meetflow-ai-client-[a-z0-9-]+\.vercel\.app$/i.test(window.location.hostname);

if (isVercelPreviewHost && window.location.hostname !== productionHost) {
  window.location.replace(`https://${productionHost}${window.location.pathname}${window.location.search}${window.location.hash}`);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
