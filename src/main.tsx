import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initClientSentry } from "./lib/sentry";

initClientSentry();

createRoot(document.getElementById("root")!).render(<App />);
