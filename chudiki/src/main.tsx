import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initAnalytics } from './analytics';
import { LabApp } from './lab/LabApp';
import './styles.css';

const isLab = window.location.pathname === '/lab' || window.location.pathname.endsWith('/lab');
if (!isLab) initAnalytics('island');

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    {isLab ? <LabApp /> : <App />}
  </StrictMode>,
);
