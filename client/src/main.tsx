import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// Service Worker (PWA)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		const swUrl = `${import.meta.env.BASE_URL}sw.js`;
		navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL }).catch(() => {
			// Silent fail: app should work without SW
		});
	});
}
