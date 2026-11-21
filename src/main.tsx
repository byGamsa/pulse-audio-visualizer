import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import { App } from './App';
import { DisplayApp } from './display/DisplayApp';
import { isDisplayWindow } from './display/link';
import { EmbedApp } from './embed/EmbedApp';
import { isEmbed } from './embed/params';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isEmbed() ? <EmbedApp /> : isDisplayWindow() ? <DisplayApp /> : <App />}
  </StrictMode>,
);
