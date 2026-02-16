// src/context/cart-context.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react"

// Default cart context value to prevent errors during initial render
const defaultCartContext = {
  _isProvider: false, // Flag to identify if this is from the actual provider
  cart: [],
  items: [],
  itemCount: 0,
  total: 0,
  lastAddEvent: null,
  lastRemoveEvent: null,
  addToCart: () => {
    console.warn('CartProvider not available - addToCart called');
  },
  removeFromCart: () => {
    console.warn('CartProvider not available - removeFromCart called');
  },
  updateQuantity: () => {
    console.warn('CartProvider not available - updateQuantity called');
  },
  getCartCount: () => 0,
  isInCart: () => false,
  getCartItem: () => null,
  getCartItemId: (productId, selectedVariantId) =>
    selectedVariantId ? `${productId}__${selectedVariantId}` : (productId || ''),
  clearCart: () => {
    console.warn('CartProvider not available - clearCart called');
  },
  cleanCartForRestaurant: () => {
    console.warn('CartProvider not available - cleanCartForRestaurant called');
  },
}

const CartContext = createContext(defaultCartContext)

export function CartProvider({ children }) {
  // Safe init (works with SSR and bad JSON)
  const [cart, setCart] = useState(() => {
    if (typeof window === "undefined") return []
    try {
      const saved = localStorage.getItem("cart")
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Track last add event for animation
  const [lastAddEvent, setLastAddEvent] = useState(null)
  // Track last remove event for animation
  const [lastRemoveEvent, setLastRemoveEvent] = useState(null)

  // Persist to localStorage whenever cart changes
  useEffect(() => {
    try {
      localStorage.setItem("cart", JSON.stringify(cart))
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, [cart])

  // Generate cart item ID: productId for no variant, productId__variantId for variants
  const getCartItemId = (productId, selectedVariantId) => {
    const pid = productId ?? '';
    if (selectedVariantId) {
      return `${pid}__${selectedVariantId}`;
    }
    return pid;
  };

  const addToCart = (item, sourcePosition = null) => {
    setCart((prev) => {
      const productId = item.productId ?? item.id;
      const selectedVariantId = item.selectedVariantId ?? null;
      const cartItemId = getCartItemId(productId, selectedVariantId);

      // CRITICAL: Validate restaurant consistency
      if (prev.length > 0) {
        const firstItemRestaurantId = prev[0]?.restaurantId;
        const firstItemRestaurantName = prev[0]?.restaurant;
        const newItemRestaurantId = item?.restaurantId;
        const newItemRestaurantName = item?.restaurant;

        if (firstItemRestaurantId && newItemRestaurantId) {
          const firstIdStr = String(firstItemRestaurantId).trim();
          const newIdStr = String(newItemRestaurantId).trim();

          if (firstIdStr === newIdStr) {
            const existing = prev.find((i) => i.id === cartItemId);
            if (existing) {
              if (sourcePosition) {
                setLastAddEvent({
                  product: {
                    id: cartItemId,
                    name: item.productName ?? item.name,
                    imageUrl: item.image || item.imageUrl,
                  },
                  sourcePosition,
                });
                setTimeout(() => setLastAddEvent(null), 1500);
              }
              return prev.map((i) =>
                i.id === cartItemId ? { ...i, quantity: i.quantity + 1 } : i
              );
            }
          }
        }

        const normalizeName = (name) => name ? name.trim().toLowerCase() : '';
        const firstRestaurantNameNormalized = normalizeName(firstItemRestaurantName);
        const newRestaurantNameNormalized = normalizeName(newItemRestaurantName);

        if (firstRestaurantNameNormalized && newRestaurantNameNormalized &&
            firstRestaurantNameNormalized !== newRestaurantNameNormalized) {
          console.error('❌ Cannot add item: Restaurant mismatch!', {
            cartRestaurantId: firstItemRestaurantId,
            cartRestaurantName: firstItemRestaurantName,
            newItemRestaurantId,
            newItemRestaurantName
          });
          throw new Error(`Cart already contains items from "${firstItemRestaurantName}". Please clear cart or complete order first.`);
        }
      }

      const existing = prev.find((i) => i.id === cartItemId);
      if (existing) {
        if (sourcePosition) {
          setLastAddEvent({
            product: {
              id: cartItemId,
              name: item.productName ?? item.name,
              imageUrl: item.image || item.imageUrl,
            },
            sourcePosition,
          });
          setTimeout(() => setLastAddEvent(null), 1500);
        }
        return prev.map((i) =>
          i.id === cartItemId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }

      if (!item.restaurantId && !item.restaurant) {
        console.error('❌ Cannot add item: Missing restaurant information!', item);
        throw new Error('Item is missing restaurant information. Please refresh the page.');
      }

      const variantPrice = item.variantPrice ?? item.price;
      const quantity = item.quantity ?? 1;
      const totalPrice = variantPrice * quantity;

      const newItem = {
        ...item,
        id: cartItemId,
        productId,
        productName: item.productName ?? item.name,
        name: item.productName ?? item.name,
        selectedVariantId: selectedVariantId || undefined,
        selectedVariantName: item.selectedVariantName || undefined,
        variantPrice,
        price: variantPrice,
        quantity,
        totalPrice,
      };

      if (sourcePosition) {
        setLastAddEvent({
          product: {
            id: cartItemId,
            name: newItem.name + (item.selectedVariantName ? ` - ${item.selectedVariantName}` : ''),
            imageUrl: item.image || item.imageUrl,
          },
          sourcePosition,
        });
        setTimeout(() => setLastAddEvent(null), 1500);
      }

      return [...prev, newItem];
    });
  };

  const removeFromCart = (itemId, sourcePosition = null, productInfo = null) => {
    setCart((prev) => {
      const itemToRemove = prev.find((i) => i.id === itemId)
      if (itemToRemove && sourcePosition && productInfo) {
        // Set last remove event for animation
        setLastRemoveEvent({
          product: {
            id: productInfo.id || itemToRemove.id,
            name: productInfo.name || itemToRemove.name,
            imageUrl: productInfo.imageUrl || productInfo.image || itemToRemove.image || itemToRemove.imageUrl,
          },
          sourcePosition,
        })
        // Clear after animation completes
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      return prev.filter((i) => i.id !== itemId)
    })
  }

  const updateQuantity = (itemId, quantity, sourcePosition = null, productInfo = null) => {
    if (quantity <= 0) {
      setCart((prev) => {
        const itemToRemove = prev.find((i) => i.id === itemId)
        if (itemToRemove && sourcePosition && productInfo) {
          // Set last remove event for animation
          setLastRemoveEvent({
            product: {
              id: productInfo.id || itemToRemove.id,
              name: productInfo.name || itemToRemove.name,
              imageUrl: productInfo.imageUrl || productInfo.image || itemToRemove.image || itemToRemove.imageUrl,
            },
            sourcePosition,
          })
          // Clear after animation completes
          setTimeout(() => setLastRemoveEvent(null), 1500)
        }
        return prev.filter((i) => i.id !== itemId)
      })
      return
    }

    // When quantity decreases (but not to 0), also trigger removal animation
    setCart((prev) => {
      const existingItem = prev.find((i) => i.id === itemId)
      if (existingItem && quantity < existingItem.quantity && sourcePosition && productInfo) {
        // Set last remove event for animation when decreasing quantity
        setLastRemoveEvent({
          product: {
            id: productInfo.id || existingItem.id,
            name: productInfo.name || existingItem.name,
            imageUrl: productInfo.imageUrl || productInfo.image || existingItem.image || existingItem.imageUrl,
          },
          sourcePosition,
        })
        // Clear after animation completes
        setTimeout(() => setLastRemoveEvent(null), 1500)
      }
      return prev.map((i) => (i.id === itemId ? { ...i, quantity } : i))
    })
  }

  const getCartCount = () =>
    cart.reduce((total, item) => total + (item.quantity || 0), 0)

  const isInCart = (itemId) => cart.some((i) => i.id === itemId)

  const getCartItem = (itemId) => cart.find((i) => i.id === itemId)

  const clearCart = () => {
    setCart([])
    // Explicitly clear localStorage to ensure cart is cleared immediately
    try {
      localStorage.removeItem("cart")
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }

  // Clean cart to remove items from different restaurants
  // Keeps only items from the specified restaurant
  const cleanCartForRestaurant = (restaurantId, restaurantName) => {
    let cleaned = false;
    setCart((prev) => {
      if (prev.length === 0) return prev;

      // Normalize restaurant name for comparison
      const normalizeName = (name) => name ? name.trim().toLowerCase() : '';
      const targetRestaurantNameNormalized = normalizeName(restaurantName);

      // Filter cart to keep only items from the target restaurant
      const cleanedCart = prev.filter((item) => {
        const itemRestaurantId = item?.restaurantId;
        const itemRestaurantName = item?.restaurant;
        const itemRestaurantNameNormalized = normalizeName(itemRestaurantName);

        // Check by ID first (most reliable)
        if (restaurantId && itemRestaurantId) {
          const targetIdStr = String(restaurantId).trim();
          const itemIdStr = String(itemRestaurantId).trim();
          if (targetIdStr === itemIdStr) return true;
        }

        // Fallback to name comparison
        if (targetRestaurantNameNormalized && itemRestaurantNameNormalized) {
          return itemRestaurantNameNormalized === targetRestaurantNameNormalized;
        }

        return false;
      });

      if (cleanedCart.length !== prev.length) {
        cleaned = true;
        console.warn('🧹 Cleaned cart: Removed items from different restaurants', {
          before: prev.length,
          after: cleanedCart.length,
          removed: prev.length - cleanedCart.length
        });
      }

      return cleanedCart;
    });
    return cleaned;
  }

  // Validate and clean cart on mount/load to prevent multiple restaurant items
  // This runs only once on initial load to clean up any corrupted cart data from localStorage
  useEffect(() => {
    if (cart.length === 0) return;

    // Get unique restaurant IDs and names
    const restaurantIds = cart.map(item => item.restaurantId).filter(Boolean);
    const restaurantNames = cart.map(item => item.restaurant).filter(Boolean);
    const uniqueRestaurantIds = [...new Set(restaurantIds)];
    const uniqueRestaurantNames = [...new Set(restaurantNames)];

    // Normalize restaurant names for comparison
    const normalizeName = (name) => name ? name.trim().toLowerCase() : '';
    const uniqueRestaurantNamesNormalized = uniqueRestaurantNames.map(normalizeName);
    const uniqueRestaurantNamesSet = new Set(uniqueRestaurantNamesNormalized);

    // Check if cart has items from multiple restaurants
    if (uniqueRestaurantIds.length > 1 || uniqueRestaurantNamesSet.size > 1) {
      console.warn('⚠️ Cart contains items from multiple restaurants. Cleaning cart...', {
        restaurantIds: uniqueRestaurantIds,
        restaurantNames: uniqueRestaurantNames
      });

      // Keep items from the first restaurant (most recent or first in cart)
      const firstRestaurantId = uniqueRestaurantIds[0];
      const firstRestaurantName = uniqueRestaurantNames[0];

      setCart((prev) => {
        const normalizeName = (name) => name ? name.trim().toLowerCase() : '';
        const firstRestaurantNameNormalized = normalizeName(firstRestaurantName);

        return prev.filter((item) => {
          const itemRestaurantId = item?.restaurantId;
          const itemRestaurantName = item?.restaurant;
          const itemRestaurantNameNormalized = normalizeName(itemRestaurantName);

          // Check by restaurant name first
          if (firstRestaurantNameNormalized && itemRestaurantNameNormalized) {
            return itemRestaurantNameNormalized === firstRestaurantNameNormalized;
          }
          // Fallback to ID comparison
          if (firstRestaurantId && itemRestaurantId) {
            return itemRestaurantId === firstRestaurantId ||
              itemRestaurantId === firstRestaurantId.toString() ||
              itemRestaurantId.toString() === firstRestaurantId;
          }
          return false;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount to clean up localStorage data

  // Transform cart to match AddToCartAnimation expected structure
  const cartForAnimation = useMemo(() => {
    const items = cart.map(item => ({
      product: {
        id: item.id,
        name: item.selectedVariantName
          ? `${item.productName || item.name} - ${item.selectedVariantName}`
          : (item.productName || item.name),
        imageUrl: item.image || item.imageUrl,
      },
      quantity: item.quantity || 1,
    }))

    const itemCount = cart.reduce((total, item) => total + (item.quantity || 0), 0)
    const total = cart.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0)

    return {
      items,
      itemCount,
      total,
    }
  }, [cart])

  const value = useMemo(
    () => ({
      _isProvider: true, // Flag to identify this is from the actual provider
      cart,
      items: cartForAnimation.items,
      itemCount: cartForAnimation.itemCount,
      total: cartForAnimation.total,
      lastAddEvent,
      lastRemoveEvent,
      addToCart,
      removeFromCart,
      updateQuantity,
      getCartCount,
      isInCart,
      getCartItem,
      getCartItemId,
      clearCart,
      cleanCartForRestaurant,
    }),
    [cart, cartForAnimation, lastAddEvent, lastRemoveEvent]
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  // Check if context is from the actual provider by checking the _isProvider flag
  if (!context || context._isProvider !== true) {
    // In development, log a warning but don't throw to prevent crashes
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ useCart called outside CartProvider. Using default values.');
      console.warn('💡 Make sure the component is rendered inside UserLayout which provides CartProvider.');
    }
    // Return default context instead of throwing
    return defaultCartContext
  }
  return context
}
