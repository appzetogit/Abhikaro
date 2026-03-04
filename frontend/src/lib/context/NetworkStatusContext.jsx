import { createContext, useContext, useEffect, useState } from "react";
import {
  getNetworkStatus,
  subscribeNetworkStatus,
} from "@/lib/utils/networkStatus.js";

const NetworkStatusContext = createContext({
  status: "online",
  isOnline: true,
  isSlow: false,
  isOffline: false,
});

export function NetworkStatusProvider({ children }) {
  const [status, setStatus] = useState(() => getNetworkStatus());

  useEffect(() => {
    const unsubscribe = subscribeNetworkStatus(setStatus);
    return () => {
      unsubscribe && unsubscribe();
    };
  }, []);

  const value = {
    status,
    isOnline: status === "online",
    isSlow: status === "slow",
    isOffline: status === "offline",
  };

  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus() {
  return useContext(NetworkStatusContext);
}

