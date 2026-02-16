import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: [
      "@emotion/react",
      "@emotion/styled",
      "@mui/material",
      "@mui/x-date-pickers",
      "mapbox-gl",
      "react-map-gl",
    ],
  },
  server: {
    host: "0.0.0.0", // Allow access from network
    port: 5173, // Default Vite port
    proxy: {
      // Proxy service worker requests to backend (backend serves configured version)
      // Fallback static file in public/ will be used if backend is unavailable
      "/firebase-messaging-sw.js": {
        target: "http://localhost:5000",
        changeOrigin: true,
        // Don't rewrite the path - backend serves at root
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            // If backend is unavailable, let Vite serve the static fallback
            console.log('Backend unavailable for service worker, using static fallback');
          });
        },
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
});
