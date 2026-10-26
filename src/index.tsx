import React from 'react';
import ReactDOM from 'react-dom/client';
import { flushSync } from 'react-dom';
import './index.scss';
import App from './components/App';
import './stylesheets/main.scss';

const rootElement = document.getElementById('root') as HTMLElement;
const root = ReactDOM.createRoot(rootElement);

// Render synchronously: the App constructor attaches the component relay
// message listener, and Standard Notes sends `component-registered` exactly
// once, on the iframe load event. With createRoot's default async
// scheduling, slow devices (mobile WebViews) can fire `load` before the
// first render, so the registration is lost and the note never streams in.
flushSync(() => {
  root.render(<App />);
});
