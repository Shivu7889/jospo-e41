'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useToast } from '@/components/Toast';
import { getPlantMeta, normalizePlant, PLANTS } from '@/lib/plants';
import { resolveItemLoadedPlant, resolveNextLoadingPlant } from '@/lib/dispatch';

export default function CoLoadingModal({ dispatch, activePlant, currentPlant: propPlant, onClose, onSuccess }) {
  const { showToast } = useToast();

  const currentPlant = normalizePlant(
    propPlant ||
    resolveNextLoadingPlant(dispatch) ||
    (activePlant && activePlant !== 'ALL' ? activePlant : 'D4')
  );
  const plantMeta = getPlantMeta(currentPlant);
  const originPlant = normalizePlant(dispatch?.from_location || 'E41 G2');

  const [loadingModels, setLoadingModels] = useState(true);
  const [availableModels, setAvailableModels] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);

  // New items to load from current plant
  const [newItems, setNewItems] = useState([
    { id: `coload-${Date.now()}-1`, model_id: '', quantity: 1 },
  ]);
  const [notes, setNotes] = useState('');

  // Fetch models manufacturable or stocked at current plant
  const fetchPlantModels = useCallback(async () => {
    try {
      setLoadingModels(true);
      const res = await fetch(`/api/models?active_only=true&for_plant=${encodeURIComponent(currentPlant)}&view=dispatch`);
      const data = await res.json();
      if (res.ok && data.success) {
        setAvailableModels(data.models || []);
      } else {
        throw new Error(data.error || 'Failed to load models');
      }
    } catch (err) {
      console.error('Error loading plant models:', err);
      showToast('Could not load plant models', 'error');
    } finally {
      setLoadingModels(false);
    }
  }, [currentPlant, showToast]);

  useEffect(() => {
    fetchPlantModels();
  }, [fetchPlantModels]);

  // Existing items already loaded at prior stops (grouped by plant)
  const existingByPlant = useMemo(() => {
    const groups = {};
    (dispatch?.dispatch_items || []).forEach((item) => {
      const p = resolveItemLoadedPlant(item, dispatch);
      if (p !== currentPlant) {
        if (!groups[p]) groups[p] = [];
        groups[p].push(item);
      }
    });
    return groups;
  }, [dispatch, currentPlant]);

  const existingTotalQty = useMemo(() => {
    return (dispatch?.dispatch_items || []).reduce((acc, it) => {
      const p = resolveItemLoadedPlant(it, dispatch);
      return p !== currentPlant ? acc + (Number(it.quantity) || 0) : acc;
    }, 0);
  }, [dispatch, currentPlant]);

  const newTotalQty = useMemo(() => {
    if (skipLoading) return 0;
    return newItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  }, [newItems, skipLoading]);

  const grandTotalQty = existingTotalQty + newTotalQty;

  // Track all plants involved so far
  const alreadyLoadedPlants = useMemo(() => {
    const plants = new Set();
    if (dispatch?.from_location) plants.add(normalizePlant(dispatch.from_location));
    (dispatch?.dispatch_items || []).forEach((it) => {
      const p = resolveItemLoadedPlant(it, dispatch);
      if (p) plants.add(p);
    });
    if (dispatch?.second_plant) plants.add(normalizePlant(dispatch.second_plant));
    if (dispatch?.third_plant) plants.add(normalizePlant(dispatch.third_plant));
    plants.add(currentPlant);
    return Array.from(plants);
  }, [dispatch, currentPlant]);

  // Unvisited plants (remaining candidates for Stop 3)
  const unvisitedPlants = useMemo(() => {
    return PLANTS.filter((p) => !alreadyLoadedPlants.includes(p.id));
  }, [alreadyLoadedPlants]);

  // Choice between finishing dispatch or sending to 3rd plant
  const [isFinalStop, setIsFinalStop] = useState(true);
  const [nextPlant, setNextPlant] = useState(unvisitedPlants[0]?.id || '');

  useEffect(() => {
    if (unvisitedPlants.length > 0 && !nextPlant) {
      setNextPlant(unvisitedPlants[0].id);
    }
  }, [unvisitedPlants, nextPlant]);

  // Line item helpers
  const handleAddRow = () => {
    setSkipLoading(false);
    setNewItems((prev) => [
      ...prev,
      { id: `coload-${Date.now()}-${prev.length + 1}`, model_id: '', quantity: 1 },
    ]);
  };

  const handleRemoveRow = (rowId) => {
    setNewItems((prev) => {
      const filtered = prev.filter((it) => it.id !== rowId);
      return filtered;
    });
  };

  const handleUpdateItem = (rowId, field, value) => {
    setNewItems((prev) =>
      prev.map((it) => {
        if (it.id !== rowId) return it;
        return { ...it, [field]: value };
      })
    );
  };

  // Stock deficit verification
  const stockDeficits = useMemo(() => {
    if (skipLoading) return [];
    const deficits = [];
    newItems.forEach((item) => {
      if (!item.model_id) return;
      const modelObj = availableModels.find((m) => m.id === item.model_id);
      if (!modelObj) return;
      const currentStock = modelObj.current_stock ?? 0;
      const requested = Number(item.quantity) || 0;
      if (requested > currentStock) {
        deficits.push({
          model_name: modelObj.name,
          model_code: modelObj.code,
          available: currentStock,
          requested,
        });
      }
    });
    return deficits;
  }, [newItems, availableModels, skipLoading]);

  // Submit co-loading
  const handleSubmitCoLoad = async (e) => {
    e.preventDefault();

    const validItems = skipLoading
      ? []
      : newItems.filter((it) => it.model_id && Number(it.quantity) > 0);

    const isFinal = unvisitedPlants.length === 0 ? true : isFinalStop;
    const designatedNextPlant = (!isFinal && nextPlant) ? nextPlant : null;

    // If no coolers selected and not marked pass-through, ensure user either forwards or marks final stop
    if (validItems.length === 0 && !isFinal && !designatedNextPlant) {
      showToast(`Please select the next plant to forward this vehicle to.`, 'warning');
      return;
    }

    if (validItems.length > 0 && stockDeficits.length > 0) {
      showToast(
        `Insufficient stock for ${stockDeficits.map((d) => d.model_code).join(', ')}. Please adjust quantities.`,
        'error'
      );
      return;
    }

    const effectiveNotes = notes.trim()
      ? notes.trim()
      : validItems.length === 0
      ? isFinal
        ? `No coolers loaded at ${currentPlant} Plant. Dispatched directly to destination.`
        : `Items not in stock at ${currentPlant} Plant. Vehicle moved to ${designatedNextPlant} Plant for loading.`
      : '';

    try {
      setSubmitting(true);
      const res = await fetch(`/api/dispatch/${dispatch.id}/coload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: validItems.map((it) => {
            const m = availableModels.find((model) => model.id === it.model_id);
            return {
              model_id: it.model_id,
              model_code: m?.code || '',
              model_name: m?.name || '',
              quantity: parseInt(it.quantity, 10),
            };
          }),
          notes: effectiveNotes,
          is_final_stop: isFinal,
          next_plant: designatedNextPlant,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete co-loading');
      }

      showToast(data.message || 'Vehicle movement confirmed successfully!', 'success');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Co-load submission error:', err);
      showToast(err.message || 'Error completing co-load', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-2xl w-full p-5 sm:p-6 space-y-4 animate-scaleUp max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <span className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-bold flex-shrink-0">
              🚚
            </span>
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                <span>Multi-Plant Co-Loading</span>
                <span className="text-[10px] bg-indigo-100 text-indigo-800 font-extrabold px-2 py-0.5 rounded-full uppercase">
                  {alreadyLoadedPlants.length >= 3 ? 'Stop 3 (Final)' : `Stop ${alreadyLoadedPlants.length}`}
                </span>
              </h3>
              <p className="text-xs text-gray-500">
                Loading at <strong>{currentPlant} Plant</strong> onto vehicle{' '}
                <span className="font-mono font-bold text-gray-900">{dispatch?.vehicle_number}</span>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Vehicle & Party Summary Bar */}
        <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div>
            <span className="text-gray-500 block">Truck / Vehicle:</span>
            <span className="font-mono font-bold text-gray-900">{dispatch?.vehicle_number}</span>
          </div>
          <div>
            <span className="text-gray-500 block">Final Destination:</span>
            <span className="font-semibold text-gray-900 truncate block">{dispatch?.destination}</span>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-gray-500 block">Previously Loaded:</span>
            <span className="font-bold text-indigo-700">{existingTotalQty} units</span>
          </div>
        </div>

        {/* Previously Loaded Items by Plant (Read-Only) */}
        {Object.keys(existingByPlant).length > 0 && (
          <div className="border border-indigo-200/80 rounded-xl p-3.5 bg-indigo-50/40 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center space-x-1.5">
                <span>🚚 Cargo Already on Vehicle (Previous Stops)</span>
              </h4>
              <span className="text-[11px] font-extrabold text-indigo-800 bg-indigo-100/90 px-2.5 py-0.5 rounded-full border border-indigo-300">
                {existingTotalQty} units on board
              </span>
            </div>

            <div className="space-y-2">
              {Object.entries(existingByPlant).map(([plantName, plantItems]) => {
                const subtotal = plantItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
                return (
                  <div key={plantName} className="bg-white rounded-lg border border-indigo-200 p-2.5 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold text-gray-800 mb-1.5 pb-1 border-b border-gray-100">
                      <span className="flex items-center space-x-1.5 text-primary-900 font-extrabold">
                        <span>🏭</span>
                        <span>Loaded at {plantName} Plant</span>
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                          Read-Only (Already Loaded)
                        </span>
                      </span>
                      <span className="text-gray-700 font-extrabold">{subtotal} pcs</span>
                    </div>
                    <div className="space-y-1">
                      {plantItems.map((it, idx) => (
                        <div key={it.id || idx} className="flex items-center justify-between text-[11px] text-gray-600">
                          <span className="font-medium">
                            <strong className="text-gray-900 font-mono">{it.cooler_models?.code}</strong> - {it.cooler_models?.name}
                          </span>
                          <span className="font-bold text-gray-900">{it.quantity} pcs</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Current Plant Loading Form */}
        <form onSubmit={handleSubmitCoLoad} className="space-y-4">
          {/* Quick Option: Skip loading if items out of stock / pass-through */}
          <div className="p-3 bg-amber-50/80 border border-amber-300 rounded-xl space-y-1.5 transition-all">
            <label className="flex items-center space-x-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipLoading}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSkipLoading(checked);
                  if (checked && unvisitedPlants.length > 0) {
                    setIsFinalStop(false);
                    if (!nextPlant && unvisitedPlants[0]) {
                      setNextPlant(unvisitedPlants[0].id);
                    }
                  }
                }}
                className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-bold text-amber-950 flex items-center space-x-1.5">
                <span>⚡ Items not in stock at {currentPlant}?</span>
                <span className="text-[10px] font-semibold bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full">
                  Pass-through / Forward vehicle without loading
                </span>
              </span>
            </label>
            {skipLoading && (
              <p className="text-[11px] text-amber-800 pl-6.5 font-medium leading-relaxed">
                Coolers are out of stock at {currentPlant}. 0 coolers will be loaded from {currentPlant}, and this vehicle will be forwarded to {unvisitedPlants.length > 0 ? (nextPlant ? <strong>{nextPlant} Plant</strong> : 'the next plant') : 'final destination'} for loading.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <div>
              <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center space-x-1.5">
                <span>➕ Add Models to Load from {currentPlant} Plant</span>
              </h4>
              <p className="text-[11px] text-gray-500">
                Only {currentPlant} models and stock are listed below. Stock will be debited from {currentPlant} inventory.
              </p>
            </div>
            {!skipLoading && (
              <button
                type="button"
                onClick={handleAddRow}
                disabled={loadingModels}
                className="text-xs font-bold text-primary-700 hover:text-primary-800 bg-primary-50 hover:bg-primary-100 px-2.5 py-1 rounded-md border border-primary-200 inline-flex items-center space-x-1 transition-colors"
              >
                <span>+ Add Model</span>
              </button>
            )}
          </div>

          {skipLoading ? (
            <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-xl text-center space-y-1.5">
              <span className="text-2xl">🚚</span>
              <p className="text-xs font-bold text-gray-800">
                0 coolers will be loaded from {currentPlant} Plant.
              </p>
              <p className="text-[11px] text-gray-500">
                Vehicle is carrying {existingTotalQty} units from prior stops.
              </p>
              <button
                type="button"
                onClick={() => setSkipLoading(false)}
                className="text-xs text-primary-700 hover:underline font-semibold mt-1"
              >
                ← Want to load coolers? Click here to add items
              </button>
            </div>
          ) : loadingModels ? (
            <div className="py-8 text-center bg-gray-50 rounded-xl border border-gray-200">
              <LoadingSpinner message={`Loading ${currentPlant} models & inventory...`} size="sm" />
            </div>
          ) : availableModels.length === 0 ? (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 text-center font-medium space-y-2">
              <p>⚠️ No cooler models or stock available for {currentPlant} plant.</p>
              {unvisitedPlants.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSkipLoading(true);
                    setIsFinalStop(false);
                    if (!nextPlant && unvisitedPlants[0]) setNextPlant(unvisitedPlants[0].id);
                  }}
                  className="btn-primary text-xs py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold"
                >
                  Forward vehicle to {unvisitedPlants[0]?.name || 'Next Plant'} without loading
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {newItems.length === 0 ? (
                <div className="p-3 bg-gray-50 border border-dashed border-gray-300 rounded-xl text-center space-y-1">
                  <p className="text-xs text-gray-500">No models added for {currentPlant}.</p>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="text-xs font-bold text-primary-700 hover:underline"
                  >
                    + Add Cooler Model to Load
                  </button>
                </div>
              ) : (
                newItems.map((item, index) => {
                const selectedModel = availableModels.find((m) => m.id === item.model_id);
                const currentStock = selectedModel?.current_stock ?? 0;
                const isOverStock = selectedModel && Number(item.quantity) > currentStock;

                return (
                  <div
                    key={item.id}
                    className="p-3 bg-white rounded-xl border border-gray-200 shadow-2xs space-y-2 transition-all hover:border-gray-300"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-gray-600">
                        {currentPlant} Item #{index + 1}
                      </span>
                      {newItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(item.id)}
                          className="text-red-500 hover:text-red-700 text-xs font-semibold"
                        >
                          ✕ Remove
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-8">
                        <select
                          value={item.model_id}
                          onChange={(e) => handleUpdateItem(item.id, 'model_id', e.target.value)}
                          className="input-field text-xs font-semibold bg-white"
                          required
                        >
                          <option value="">-- Select Cooler Model ({currentPlant} Only) --</option>
                          {availableModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.code} - {m.name} ({currentPlant} Stock: {m.current_stock ?? 0} pcs)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-4">
                        <div className="flex items-center space-x-1">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Quantity"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(item.id, 'quantity', e.target.value)}
                            className={`input-field text-xs font-bold bg-white ${
                              isOverStock ? 'border-red-500 text-red-600 focus:border-red-500' : ''
                            }`}
                            required
                          />
                          <span className="text-xs text-gray-500 font-medium">pcs</span>
                        </div>
                      </div>
                    </div>

                    {selectedModel && (
                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="text-gray-500">
                          {currentPlant} Warehouse Stock:{' '}
                          <strong className={currentStock > 0 ? 'text-emerald-700' : 'text-red-600'}>
                            {currentStock} pcs
                          </strong>
                        </span>
                        {isOverStock && (
                          <span className="text-red-600 font-bold animate-pulse">
                            ⚠️ Exceeds {currentPlant} stock by {Number(item.quantity) - currentStock} pcs
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-[11px] font-bold text-gray-700 block mb-1">
              {currentPlant} Loading Remarks / Supervisor Notes (Optional):
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Loaded rear section, seal verified, driver signed"
              className="input-field text-xs bg-white"
              disabled={submitting}
            />
          </div>

          {/* Multi-Plant Route Decision (Final Stop vs 3rd Plant) */}
          {unvisitedPlants.length > 0 ? (
            <div className="p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-300 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950 flex items-center space-x-1.5">
                  <span>🛑 Is this the final stop for this vehicle?</span>
                </span>
                <span className="text-[10px] font-bold text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-full border border-amber-300">
                  {alreadyLoadedPlants.length} of 3 Plants Loaded
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <label
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start space-x-2 ${
                    isFinalStop
                      ? 'bg-white border-emerald-500 ring-2 ring-emerald-500 shadow-xs'
                      : 'bg-white/60 border-amber-200 hover:bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="stopType"
                    checked={isFinalStop}
                    onChange={() => setIsFinalStop(true)}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-gray-900 block">
                      ✅ Vehicle is Full (Final Stop)
                    </span>
                    <span className="text-[11px] text-gray-600 block mt-0.5">
                      वाहन पूरी तरह भर गया है ➔ सीधे पार्टी ({dispatch?.destination}) को रवाना करें।
                    </span>
                  </div>
                </label>

                <label
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start space-x-2 ${
                    !isFinalStop
                      ? 'bg-white border-amber-500 ring-2 ring-amber-500 shadow-xs'
                      : 'bg-white/60 border-amber-200 hover:bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="stopType"
                    checked={!isFinalStop}
                    onChange={() => setIsFinalStop(false)}
                    className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <div>
                    <span className="font-bold text-gray-900 block">
                      🚚 Send to 3rd Plant (तीसरा स्टॉप)
                    </span>
                    <span className="text-[11px] text-gray-600 block mt-0.5">
                      वाहन में अभी जगह है ➔ तीसरे प्लांट पर और मॉडल लोड होंगे।
                    </span>
                  </div>
                </label>
              </div>

              {!isFinalStop && (
                <div className="pt-2 border-t border-amber-200/70 flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-xs font-bold text-amber-950 whitespace-nowrap">
                    अगला लोडिंग प्लांट चुनें: <span className="text-red-500">*</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {unvisitedPlants.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setNextPlant(p.id)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all flex items-center space-x-1 ${
                          nextPlant === p.id
                            ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-amber-100'
                        }`}
                      >
                        <span>{p.icon}</span>
                        <span>{p.shortName} Plant</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-center space-x-2">
              <span className="text-base">🎉</span>
              <span>
                <strong>All 3 Plants Completed:</strong> तीनों मैन्युफैक्चरिंग प्लांट्स (E41 G2, C116, D4) से माल लोड हो चुका है। यह फाइनल स्टॉप है।
              </span>
            </div>
          )}

          {/* Grand Total Summary Box */}
          <div className="p-3 bg-gradient-to-r from-gray-900 to-indigo-950 text-white rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[11px] text-gray-300 block uppercase tracking-wider font-semibold">
                Vehicle Consolidated Load Preview:
              </span>
              <span className="text-xs text-gray-300">
                Prior Stops: <strong>{existingTotalQty} pcs</strong> + {currentPlant}:{' '}
                <strong>{newTotalQty} pcs</strong>
              </span>
            </div>
            <div className="text-right">
              <span className="text-lg sm:text-xl font-black font-mono text-emerald-400">
                {grandTotalQty} pcs
              </span>
              <span className="text-[10px] text-gray-300 block">Total Truck Capacity</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary text-xs py-2 px-3.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                submitting ||
                (!skipLoading && newTotalQty <= 0 && isFinalStop && unvisitedPlants.length > 0) ||
                (newTotalQty > 0 && stockDeficits.length > 0)
              }
              className={`btn-primary text-xs py-2 px-5 inline-flex items-center space-x-1.5 shadow-md font-bold ${
                !isFinalStop && unvisitedPlants.length > 0
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : ''
              }`}
            >
              <span>
                {submitting
                  ? 'Processing Vehicle...'
                  : skipLoading || newTotalQty <= 0
                  ? !isFinalStop && unvisitedPlants.length > 0
                    ? `🚚 Move Vehicle to ${nextPlant || 'Next Plant'} (0 Coolers Loaded)`
                    : `✅ Finalize Dispatch (0 Coolers Loaded from ${currentPlant})`
                  : !isFinalStop && unvisitedPlants.length > 0
                  ? `🚚 Complete & Send to ${nextPlant || '3rd Plant'}`
                  : '✅ Complete Loading & Finalize Dispatch'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
