import React, { useState, useEffect } from "react";
import {
  Clock,
  Plus,
  Trash2,
  RotateCcw,
  Save,
  Sparkles,
  Navigation,
  ChefHat,
  Timer,
  Sliders,
  CheckCircle,
  HelpCircle,
  AlertCircle,
  Layers,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@/lib/api";

const DEFAULT_SLABS = [
  { min: 1, max: 1, increasePercent: 0 },
  { min: 2, max: 2, increasePercent: 20 },
  { min: 3, max: 3, increasePercent: 30 },
  { min: 4, max: 5, increasePercent: 50 },
  { min: 6, max: 10, increasePercent: 80 },
  { min: 11, max: 20, increasePercent: 120 },
  { min: 21, max: 30, increasePercent: 170 },
  { min: 31, max: 50, increasePercent: 250 },
  { min: 51, max: 75, increasePercent: 350 },
  { min: 76, max: 100, increasePercent: 500 },
];

export default function ETASettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Core settings state
  const [quantitySlabs, setQuantitySlabs] = useState(DEFAULT_SLABS);
  const [above100IncreasePercent, setAbove100IncreasePercent] = useState(600);
  const [categoryOverheadPercent, setCategoryOverheadPercent] = useState(10);
  const [additionalQuantityOverheadPercent, setAdditionalQuantityOverheadPercent] = useState(5);
  const [deliveryTimePerKm, setDeliveryTimePerKm] = useState(8);
  const [minETALimit, setMinETALimit] = useState(15);
  const [maxETALimit, setMaxETALimit] = useState(120);

  // Simulator state
  const [simItems, setSimItems] = useState([
    { name: "Shahi Paneer", basePreparationTime: 25, quantity: 1, category: "Main Course" },
    { name: "Dal", basePreparationTime: 20, quantity: 1, category: "Dal" },
    { name: "Roti", basePreparationTime: 5, quantity: 15, category: "Breads" },
    { name: "Kadai Paneer", basePreparationTime: 20, quantity: 3, category: "Main Course" },
  ]);
  const [simDistance, setSimDistance] = useState(2.3);
  const [simResult, setSimResult] = useState(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await adminAPI.getETASettings();
      const data = res?.data?.data || res?.data;
      if (data) {
        if (Array.isArray(data.quantitySlabs) && data.quantitySlabs.length > 0) {
          setQuantitySlabs(data.quantitySlabs);
        }
        setAbove100IncreasePercent(data.above100IncreasePercent ?? 600);
        setCategoryOverheadPercent(data.categoryOverheadPercent ?? 10);
        setAdditionalQuantityOverheadPercent(data.additionalQuantityOverheadPercent ?? 5);
        setDeliveryTimePerKm(data.deliveryTimePerKm ?? 8);
        setMinETALimit(data.minETALimit ?? 15);
        setMaxETALimit(data.maxETALimit ?? 120);
      }
    } catch (error) {
      console.error("Failed to load ETA settings:", error);
      toast.error("Could not load saved settings, using defaults.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        quantitySlabs,
        above100IncreasePercent: Number(above100IncreasePercent),
        categoryOverheadPercent: Number(categoryOverheadPercent),
        additionalQuantityOverheadPercent: Number(additionalQuantityOverheadPercent),
        deliveryTimePerKm: Number(deliveryTimePerKm),
        minETALimit: Number(minETALimit),
        maxETALimit: Number(maxETALimit),
        roundingMethod: "ceil",
      };

      await adminAPI.updateETASettings(payload);
      toast.success("Dynamic ETA settings saved successfully!");
    } catch (error) {
      console.error("Error saving ETA settings:", error);
      toast.error(error?.response?.data?.message || "Failed to save ETA settings");
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefaults = () => {
    if (window.confirm("Reset all quantity slabs and rules to standard specification defaults?")) {
      setQuantitySlabs(DEFAULT_SLABS);
      setAbove100IncreasePercent(600);
      setCategoryOverheadPercent(10);
      setAdditionalQuantityOverheadPercent(5);
      setDeliveryTimePerKm(8);
      setMinETALimit(15);
      setMaxETALimit(120);
      toast.info("Settings reset to defaults. Click Save to persist.");
    }
  };

  const handleSlabChange = (index, field, value) => {
    const updated = [...quantitySlabs];
    updated[index] = { ...updated[index], [field]: Number(value) };
    setQuantitySlabs(updated);
  };

  const handleAddSlab = () => {
    const last = quantitySlabs[quantitySlabs.length - 1];
    const newMin = last ? last.max + 1 : 1;
    const newMax = newMin + 5;
    const newPercent = last ? last.increasePercent + 50 : 0;
    setQuantitySlabs([...quantitySlabs, { min: newMin, max: newMax, increasePercent: newPercent }]);
  };

  const handleDeleteSlab = (index) => {
    if (quantitySlabs.length <= 1) {
      toast.error("At least one quantity slab is required");
      return;
    }
    setQuantitySlabs(quantitySlabs.filter((_, i) => i !== index));
  };

  // Simulator item handlers
  const handleSimItemChange = (index, field, value) => {
    const updated = [...simItems];
    updated[index] = {
      ...updated[index],
      [field]: field === "basePreparationTime" || field === "quantity" ? Number(value) : value,
    };
    setSimItems(updated);
  };

  const handleAddSimItem = () => {
    setSimItems([
      ...simItems,
      { name: `Item ${simItems.length + 1}`, basePreparationTime: 15, quantity: 1, category: "Varieties" },
    ]);
  };

  const handleRemoveSimItem = (index) => {
    if (simItems.length <= 1) {
      toast.error("At least one test item is required");
      return;
    }
    setSimItems(simItems.filter((_, i) => i !== index));
  };

  const handleRunSimulation = async () => {
    try {
      setSimulating(true);
      const payload = {
        items: simItems,
        distanceKm: Number(simDistance),
        customSettings: {
          quantitySlabs,
          above100IncreasePercent: Number(above100IncreasePercent),
          categoryOverheadPercent: Number(categoryOverheadPercent),
          additionalQuantityOverheadPercent: Number(additionalQuantityOverheadPercent),
          deliveryTimePerKm: Number(deliveryTimePerKm),
          minETALimit: Number(minETALimit),
          maxETALimit: Number(maxETALimit),
        },
      };

      const res = await adminAPI.simulateETA(payload);
      setSimResult(res?.data?.data || res?.data);
      toast.success("Simulation calculated successfully!");
    } catch (error) {
      console.error("Simulation error:", error);
      toast.error(error?.response?.data?.message || "Failed to run simulation");
    } finally {
      setSimulating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm font-medium text-gray-500">Loading Dynamic ETA settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Clock className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-bold text-gray-900">Dynamic Preparation Time & Delivery ETA</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Configure automated, quantity-based food preparation time and distance-based delivery travel ETA.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleResetToDefaults}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Reset Defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Slabs & Overhead Rules (7 cols) */}
        <div className="lg:col-span-7 space-y-8">
          {/* Quantity Slabs Card */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Layers className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-semibold text-gray-900">Single-Item Quantity Slabs</h2>
              </div>
              <button
                type="button"
                onClick={handleAddSlab}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Slab
              </button>
            </div>
            <div className="p-5">
              <p className="text-xs text-gray-500 mb-4">
                Percentage increase applied over the item's base preparation time based on total ordered quantity.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2.5 rounded-l-lg">Min Qty</th>
                      <th className="px-3 py-2.5">Max Qty</th>
                      <th className="px-3 py-2.5">Increase %</th>
                      <th className="px-3 py-2.5 text-right rounded-r-lg">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {quantitySlabs.map((slab, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="1"
                            value={slab.min}
                            onChange={(e) => handleSlabChange(idx, "min", e.target.value)}
                            className="w-20 px-2.5 py-1.5 border border-gray-200 rounded-md text-xs focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="number"
                            min="1"
                            value={slab.max}
                            onChange={(e) => handleSlabChange(idx, "max", e.target.value)}
                            className="w-20 px-2.5 py-1.5 border border-gray-200 rounded-md text-xs focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              value={slab.increasePercent}
                              onChange={(e) => handleSlabChange(idx, "increasePercent", e.target.value)}
                              className="w-20 px-2.5 py-1.5 border border-gray-200 rounded-md text-xs focus:ring-1 focus:ring-emerald-500"
                            />
                            <span className="text-xs text-gray-400">%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteSlab(idx)}
                            className="text-gray-400 hover:text-red-500 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bulk order rule (> 100) */}
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-gray-700">Quantities above 100</span>
                  <p className="text-[11px] text-gray-400">Increase percentage for bulk catering orders (&gt; 100 items)</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={above100IncreasePercent}
                    onChange={(e) => setAbove100IncreasePercent(e.target.value)}
                    className="w-24 px-2.5 py-1.5 border border-gray-200 rounded-md text-xs font-semibold focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Kitchen Overheads & Travel Time Card */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 space-y-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-gray-100">
              <Sliders className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-semibold text-gray-900">Overheads & Travel Settings</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Additional Category Overhead */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">Additional Category Overhead</label>
                  <span className="text-xs font-bold text-emerald-600">{categoryOverheadPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  value={categoryOverheadPercent}
                  onChange={(e) => setCategoryOverheadPercent(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
                <p className="text-[11px] text-gray-500">
                  Added for each non-main category dish (10% of that item's own base time).
                </p>
              </div>

              {/* Additional Quantity Overhead */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">Additional Quantity Overhead</label>
                  <span className="text-xs font-bold text-emerald-600">{additionalQuantityOverheadPercent}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="25"
                  step="1"
                  value={additionalQuantityOverheadPercent}
                  onChange={(e) => setAdditionalQuantityOverheadPercent(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
                <p className="text-[11px] text-gray-500">
                  Added for each unit beyond the 1st in non-main items ((Qty - 1) × 5%).
                </p>
              </div>

              {/* Delivery Time Per Km */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">Delivery Time Per Kilometre</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={deliveryTimePerKm}
                    onChange={(e) => setDeliveryTimePerKm(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">mins / km</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Standard travel multiplier (Formula: Distance × {deliveryTimePerKm} mins, rounded up).
                </p>
              </div>

              {/* Min & Max ETA Limits */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">ETA Safety Limits (Min / Max)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="5"
                    max="60"
                    value={minETALimit}
                    onChange={(e) => setMinETALimit(Number(e.target.value))}
                    placeholder="Min"
                    className="w-1/2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-gray-400">-</span>
                  <input
                    type="number"
                    min="30"
                    max="240"
                    value={maxETALimit}
                    onChange={(e) => setMaxETALimit(Number(e.target.value))}
                    placeholder="Max"
                    className="w-1/2 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-gray-500">
                  Absolute boundary caps to prevent unrealistic ETAs.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Interactive Simulator (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-xl shadow-lg p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-white">Live ETA Simulator</h3>
              </div>
              <span className="text-xs font-mono bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                Specification Test
              </span>
            </div>

            <p className="text-xs text-slate-300">
              Verify how your configured rules calculate food preparation time and delivery ETA on real sample orders.
            </p>

            {/* Test Items List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium px-1">
                <span>Dish Name</span>
                <div className="flex gap-6 pr-6">
                  <span>Base</span>
                  <span>Qty</span>
                </div>
              </div>

              {simItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => handleSimItemChange(idx, "name", e.target.value)}
                    className="w-full bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-white"
                  />
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <input
                      type="number"
                      min="1"
                      value={item.basePreparationTime}
                      onChange={(e) => handleSimItemChange(idx, "basePreparationTime", e.target.value)}
                      className="w-14 bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-amber-300 font-mono text-center"
                      title="Base Prep Time (mins)"
                    />
                    <span className="text-[10px] text-slate-400">m</span>
                  </div>
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleSimItemChange(idx, "quantity", e.target.value)}
                      className="w-12 bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-cyan-300 font-mono text-center"
                      title="Quantity"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveSimItem(idx)}
                    className="text-slate-400 hover:text-red-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleAddSimItem}
                  className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Another Dish
                </button>

                <div className="flex items-center gap-2">
                  <Navigation className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-300">Distance:</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={simDistance}
                    onChange={(e) => setSimDistance(e.target.value)}
                    className="w-16 bg-slate-900 text-xs px-2 py-1 rounded border border-slate-700 text-amber-300 font-mono text-center"
                  />
                  <span className="text-xs text-slate-400">km</span>
                </div>
              </div>
            </div>

            {/* Calculate Button */}
            <button
              type="button"
              onClick={handleRunSimulation}
              disabled={simulating}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 font-semibold text-xs text-slate-950 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md"
            >
              <Sparkles className="w-4 h-4" />
              {simulating ? "Calculating..." : "Calculate Live ETA"}
            </button>

            {/* Simulation Results Card */}
            {simResult && (
              <div className="pt-4 border-t border-slate-700 space-y-4 animate-in fade-in-50 duration-200">
                {/* Result metrics */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700 text-center">
                    <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">Prep Time</span>
                    <span className="text-lg font-bold text-amber-400">{simResult.foodPreparationTime}m</span>
                  </div>
                  <div className="bg-slate-800/90 p-2.5 rounded-lg border border-slate-700 text-center">
                    <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">Delivery</span>
                    <span className="text-lg font-bold text-cyan-400">{simResult.deliveryTime}m</span>
                  </div>
                  <div className="bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/30 text-center">
                    <span className="text-[10px] text-emerald-400 block uppercase tracking-wider font-semibold">Customer ETA</span>
                    <span className="text-lg font-bold text-emerald-300">{simResult.totalETA}m</span>
                  </div>
                </div>

                {/* Main Item Badge */}
                {simResult.mainItem && (
                  <div className="bg-slate-800/90 p-3 rounded-lg border border-amber-500/30 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <ChefHat className="w-4 h-4 text-amber-400" />
                      <div>
                        <span className="text-slate-400">Main Item: </span>
                        <span className="font-semibold text-amber-300">{simResult.mainItem.name}</span>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-amber-400">{simResult.mainItem.adjustedTime} mins</span>
                  </div>
                )}

                {/* Breakdown list */}
                {simResult.itemsBreakdown && (
                  <div className="space-y-1.5 text-[11px] text-slate-300 bg-slate-900/60 p-3 rounded-lg border border-slate-800 font-mono">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block mb-1">
                      Overhead Calculations
                    </span>
                    {simResult.itemsBreakdown.map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-0.5">
                        <span className="truncate max-w-[150px]">
                          {item.quantity}x {item.name}
                        </span>
                        <span>
                          {item.isMainItem ? (
                            <span className="text-amber-400 font-semibold">Main ({item.adjustedTime}m)</span>
                          ) : (
                            <span className="text-slate-400">
                              +{item.categoryOverhead}m cat {item.quantityOverhead > 0 && `+${item.quantityOverhead}m qty`}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-slate-800 flex justify-between font-bold text-emerald-400">
                      <span>Total ETA Formula:</span>
                      <span>
                        {simResult.foodPreparationTime}m + {simResult.deliveryTime}m = {simResult.totalETA} mins
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
