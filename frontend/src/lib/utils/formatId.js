/**
 * Formats restaurant IDs. Specifically converts restored restaurant IDs
 * (e.g. REST-RESTORED-69d654e7c86eb9b6c8399c62) to the standard format
 * (e.g. REST-1775654119000-0034) based on the embedded timestamp.
 * 
 * @param {string|any} id 
 * @returns {string}
 */
export const formatRestaurantId = (id) => {
  if (!id) return "—";
  const idStr = String(id);
  if (idStr.startsWith("REST-RESTORED-")) {
    const objectId = idStr.replace("REST-RESTORED-", "");
    if (objectId.length === 24) {
      // Deterministically parse the timestamp embedded in the MongoDB ObjectId
      const timestampSec = parseInt(objectId.slice(0, 8), 16);
      const timestampMs = timestampSec * 1000;
      
      // Generate a deterministic 4-digit random suffix from the end of the ObjectId
      const randomPart = parseInt(objectId.slice(-4), 16) % 10000;
      const randomPartPadded = String(randomPart).padStart(4, "0");
      
      return `REST-${timestampMs}-${randomPartPadded}`;
    }
  }
  return idStr;
};
