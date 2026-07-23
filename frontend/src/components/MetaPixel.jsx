import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

// Only track in production (not on localhost or LAN IPs used during mobile dev testing)
const isProduction = () => {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return (
    hostname !== "localhost" &&
    hostname !== "127.0.0.1" &&
    !hostname.startsWith("192.168.") &&
    !hostname.startsWith("10.")
  );
};

const MetaPixel = () => {
  const { pathname, search } = useLocation();
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      // Skip the first run because index.html already fires the initial PageView
      return;
    }

    if (!isProduction()) return;

    // Standard Pixel tracking
    if (window.fbq) {
      window.fbq("track", "PageView");
    }

    // Facebook SDK App Events Tracking
    if (window.FB && window.FB.AppEvents) {
      window.FB.AppEvents.logPageView();
    }
  }, [pathname, search]);

  return null;
};

export default MetaPixel;
