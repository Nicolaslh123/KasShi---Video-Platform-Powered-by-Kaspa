import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/react-app/index.css";
import App from "@/react-app/App.tsx";

// Don't render React app for server-only routes
const pathname = window.location.pathname;
if (pathname.startsWith('/api/') || pathname === '/robots.txt') {
  // Let the server handle these - do nothing, browser will show server response
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
