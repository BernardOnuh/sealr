import { createRoot } from "react-dom/client";
import { trackViewport } from "./viewport.js";

trackViewport();
import("./pwa.js").then(p => p.registerServiceWorker());
const root = createRoot(document.getElementById("root"));
// "/" is the public home page and the app is at /app. The installed app always opens the app itself.
// The check is inlined (not pwa.js's) so the home page does not load the post-quantum libraries.
const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
if (location.pathname === "/" && !installed) import("./components/Landing.jsx").then(({ default: Landing }) => root.render(<Landing />));
else import("./App.jsx").then(({ default: App }) => root.render(<App />));
