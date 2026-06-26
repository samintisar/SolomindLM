import { ConvexReactClient } from "convex/react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ShellAwareConvexAuthProvider } from "./features/auth/components/ShellAwareConvexAuthProvider";
import "streamdown/styles.css";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) throw new Error("VITE_CONVEX_URL is required");

const convex = new ConvexReactClient(convexUrl);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Could not find root element");

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ShellAwareConvexAuthProvider client={convex}>
      <App />
    </ShellAwareConvexAuthProvider>
  </React.StrictMode>
);
