import { createContext, useContext } from 'react'
import { useDeliveryNotifications } from '../hooks/useDeliveryNotifications'

const DeliveryNotificationsContext = createContext(null)

/**
 * Provider that runs the delivery socket hook once and shares state with all delivery pages.
 * Used by DeliveryLayout so Feed (DeliveryHome), Pocket, Trip History, and Profile all get
 * wallet_updated and order notifications without duplicate socket connections.
 */
export function DeliveryNotificationsProvider({ children }) {
  const value = useDeliveryNotifications()
  return (
    <DeliveryNotificationsContext.Provider value={value}>
      {children}
    </DeliveryNotificationsContext.Provider>
  )
}

/**
 * Use delivery notifications (new order, order ready, wallet_updated) from the shared socket.
 * Must be used inside DeliveryNotificationsProvider (e.g. under DeliveryLayout).
 */
export function useDeliveryNotificationsContext() {
  const ctx = useContext(DeliveryNotificationsContext)
  return ctx
}
