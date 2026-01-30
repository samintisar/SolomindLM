import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConvexReactClient } from 'convex/react';
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react';
import { authClient } from '@/lib/auth-client';
import App from './App';
import './index.css';

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl || typeof convexUrl !== 'string') {
  throw new Error(
    'VITE_CONVEX_URL is required. Set it in apps/web/.env.local (dev) or in your hosting env (prod) to your Convex deployment URL (e.g. https://your-deployment.convex.cloud).'
  );
}

const convex = new ConvexReactClient(convexUrl, {
  expectAuth: true,
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <App />
    </ConvexBetterAuthProvider>
  </React.StrictMode>
);
