import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { loadConfig } from './app/config/env';
import { createContainer } from './app/container';
import { AppProviders } from './app/providers/AppProviders';
import { createAppRouter } from './app/router';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/components.css';
import './ui/styles/pages.css';

const container = createContainer(loadConfig());
const router = createAppRouter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders container={container}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
