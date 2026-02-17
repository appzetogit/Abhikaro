/**
 * Currency Conversion Utility
 * Converts USD to INR (Indian Rupees)
 */

// Exchange rate: 1 USD = 83 INR (approximate)
const USD_TO_INR_RATE = 83

/**
 * Convert USD amount to INR
 * @param {number} usdAmount - Amount in USD
 * @returns {number} - Amount in INR
 */
export const usdToInr = (usdAmount) => {
  return parseFloat((usdAmount * USD_TO_INR_RATE).toFixed(2))
}

/**
 * Format amount with currency symbol
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency symbol (default: '₹')
 * @returns {string} - Formatted amount string
 */
export const formatCurrency = (amount, currency = '₹') => {
  const num = parseFloat(amount)
  if (amount == null || amount === '' || Number.isNaN(num)) {
    return `${currency} 0.00`
  }
  return `${currency} ${num.toFixed(2)}`
}

/**
 * Convert and format USD to INR
 * @param {number} usdAmount - Amount in USD
 * @returns {string} - Formatted amount in INR
 */
export const formatUsdToInr = (usdAmount) => {
  return formatCurrency(usdToInr(usdAmount))
}


