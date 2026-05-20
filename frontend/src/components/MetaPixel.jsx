import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const MetaPixel = () => {
  const location = useLocation();
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      // Skip the first run because index.html already fires the initial PageView
      return;
    }

    // Standard Pixel tracking
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "PageView");
    }
    
    // Facebook SDK App Events Tracking
    if (typeof window !== "undefined" && window.FB && window.FB.AppEvents) {
      window.FB.AppEvents.logPageView();
    }
  }, [location.pathname, location.search]);

  return null;
};

export default MetaPixel;
