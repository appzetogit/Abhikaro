import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const FIREBASE_SW_PATH = "/firebase-messaging-sw.js";

function buildFirebaseMessagingSw(env) {
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY || "",
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
    projectId: env.VITE_FIREBASE_PROJECT_ID || "",
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    appId: env.VITE_FIREBASE_APP_ID || "",
  };

  const hasFirebaseConfig = [
    "apiKey",
    "authDomain",
    "projectId",
    "messagingSenderId",
    "appId",
  ].every((key) => !!firebaseConfig[key]);

  return `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};
const hasFirebaseConfig = ${JSON.stringify(hasFirebaseConfig)};

function buildNotificationOptions(payload = {}) {
  const isDeliveryNewOrder =
    payload.data?.channelId === "delivery_new_order" &&
    (payload.data?.type === "new_order" || !!payload.data?.orderId);
  const icon = payload.notification?.icon || payload.data?.icon || "/vite.svg";
  const image = payload.notification?.image || payload.data?.image || undefined;

  return {
    body: payload.notification?.body || payload.data?.body || "",
    icon,
    image,
    data: payload.data || {},
    tag: payload.data?.tag || payload.data?.orderId || payload.data?.notificationId || "admin_broadcast",
    badge: "/vite.svg",
    requireInteraction: true,
    vibrate: [200, 100, 200],
    // Audible ONLY for delivery new-order channel; keep all other notifications silent.
    // Android Chrome uses default system notification sound (custom MP3 is not reliable in background).
    silent: !isDeliveryNewOrder,
  };
}

async function showNotificationFromPayload(payload = {}) {
  const title = payload.notification?.title || payload.data?.title || "Abhikaro Update";
  const isDeliveryNewOrder =
    payload.data?.channelId === "delivery_new_order" &&
    (payload.data?.type === "new_order" || !!payload.data?.orderId);

  // If there is an open window client, ask it to play alert.mp3 (foreground-only; requires prior user interaction).
  if (isDeliveryNewOrder) {
    try {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      clientList.forEach((client) => {
        client.postMessage({ type: "PLAY_ALERT_SOUND", data: payload.data || {} });
      });
    } catch (e) {
      // ignore
    }
  }
  await self.registration.showNotification(title, buildNotificationOptions(payload));
}

if (hasFirebaseConfig) {
  try {
    importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
    importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      showNotificationFromPayload(payload);
    });
  } catch (error) {
    console.warn("[firebase-messaging-sw] Firebase initialization failed in Vite dev mode.", error);
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification?.data || {};
  const urlToOpen = data.link || data.click_action || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }

      return undefined;
    }),
  );
});`;
}

function firebaseMessagingSwPlugin(env) {
  return {
    name: "firebase-messaging-sw-dev",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestPath = req.url?.split("?")[0];

        if (requestPath !== FIREBASE_SW_PATH) {
          next();
          return;
        }

        res.setHeader("Content-Type", "application/javascript");
        res.setHeader("Cache-Control", "no-cache");
        res.end(buildFirebaseMessagingSw(env));
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");

  return {
    plugins: [react(), tailwindcss(), firebaseMessagingSwPlugin(env)],
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
      ],
    },
    server: {
      host: "0.0.0.0", // Allow access from network
      port: 5173, // Default Vite port
      proxy: {
        // Proxy /api to backend - use VITE_API_BASE_URL=/api for mobile testing on same network
        "/api": {
          target: "http://localhost:5000",
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          // Split large vendor bundles for better caching and initial load
          manualChunks: {
            react: ["react", "react-dom"],
            router: ["react-router-dom"],
            mui: ["@mui/material", "@mui/x-date-pickers", "@emotion/react", "@emotion/styled"],
            maps: ["leaflet", "react-leaflet", "@react-google-maps/api"],
            charts: ["recharts"],
          },
        },
      },
    },
  };
});
