import React from 'react';
import { createRoot } from 'react-dom/client';
import { DialRoot } from 'dialkit';
import 'dialkit/styles.css';
import './app.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <>
    <App />
    <DialRoot position="top-right" productionEnabled />
  </>
);
