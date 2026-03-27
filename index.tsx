import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

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
