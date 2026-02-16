/**
 * VariantSelector - Mandatory variant selection for products with variations
 * Uses selectable buttons (not dropdown) for better UX
 * - No auto-select (except when only 1 variant exists)
 * - Highlights selected variant
 * - Shows price dynamically
 */
export default function VariantSelector({
  variants = [],
  selectedVariant,
  onSelect,
  disabled = false,
  className = "",
}) {
  if (!variants || variants.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Choose option
      </p>
      <div className="flex flex-wrap gap-2">
        {variants.map((variant) => {
          const isSelected = selectedVariant?.id === variant.id;
          return (
            <button
              key={variant.id}
              type="button"
              onClick={() => !disabled && onSelect(variant)}
              disabled={disabled}
              className={`px-4 py-2.5 rounded-lg border-2 text-left transition-all min-w-[100px] ${
                isSelected
                  ? "border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2a2a] text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span className="block font-medium">{variant.name}</span>
              <span className="block text-sm mt-0.5 opacity-90">
                ₹{Math.round(variant.price || 0)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
