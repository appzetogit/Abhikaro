import { useNetworkStatus } from "@/lib/context/NetworkStatusContext.jsx";

export default function NetworkStatusBanner() {
  const { status, isSlow, isOffline, isBackendUnavailable } = useNetworkStatus();

  if (!isSlow && !isOffline && !isBackendUnavailable) {
    return null;
  }

  const isOfflineState = isOffline;
  const bgClass = isOfflineState ? "bg-red-600" : "bg-amber-500";

  const message = isOfflineState
    ? "You are offline. Data cannot be saved to the server. Please check your internet connection."
    : isBackendUnavailable
      ? "Internet is connected, but the backend server is unavailable. Data cannot be saved right now."
      : "Network seems slow. Requests may take longer than usual.";

  return (
    <div
      className={`${bgClass} text-white text-xs sm:text-sm text-center py-2 px-3 z-[100]`}
      style={{ position: "sticky", top: 0 }}
    >
      {message}
      <span className="ml-2 opacity-80">
        (Current status: {status})
      </span>
    </div>
  );
}

