import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import { App } from "./App";
import "./index.css";

// Error monitoring — inert until VITE_SENTRY_DSN is set (Vercel env +
// local .env). Errors only: no performance tracing / session replay,
// to stay comfortably inside the free quota. When an exception
// escapes React, Sentry reports it with the stack + browser context
// before anyone has to message Max about a blank screen.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
