import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Analytics } from '@vercel/analytics/react';
import ErrorBoundary from './components/ErrorBoundary';
import { applyOptOutFromUrl, isOptedOut, markFirstOpen } from './utils/analytics';

// Antes de montar o app: liga/desliga "não contar minhas visitas" e conta aparelho novo
applyOptOutFromUrl();
markFirstOpen();

const mountApp = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;

  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
        <Analytics beforeSend={(event) => (isOptedOut() ? null : event)} />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Erro ao renderizar App:", error);
    rootElement.innerHTML = `<div style="color: white; padding: 20px; font-family: sans-serif;">
      <h1>Ops! Algo deu errado.</h1>
      <pre>${error instanceof Error ? error.message : 'Erro desconhecido'}</pre>
    </div>`;
  }
};

mountApp();
