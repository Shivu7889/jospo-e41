'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useToast } from '@/components/Toast';
import { getPlantMeta, normalizePlant } from '@/lib/plants';
import { resolveItemLoadedPlant } from '@/lib/dispatch';

export default function CoLoadingModal({ dispatch, activePlant, onClose, onSuccess }) {
  const { showToast } = useToast();

  const currentPlant = normalizePlant(activePlant || 'D4');
  const plantMeta = getPlantMeta(currentPlant);
  const originPlant = normalizePlant(dispatch?.from_location || 'E41 G2');
  const originMeta = getPlantMeta(originPlant);

  const [loadingModels, setLoadingModels] = useState(true);
  const [availableModels, setAvailableModels] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // New items to load from current plant
  // [{ id: 'item-1', model_id: '', quantity: 1 }]
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

  // Existing items already loaded at Plant 1
  const existingItems = useMemo(() => {
    return (dispatch?.dispatch_items || []).filter((item) => {
      const p = resolveItemLoadedPlant(item, dispatch);
      return p !== currentPlant;
    });
  }, [dispatch, currentPlant]);

  const existingTotalQty = useMemo(() => {
    return existingItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  }, [existingItems]);

  const newTotalQty = useMemo(() => {
    return newItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
  }, [newItems]);

  const grandTotalQty = existingTotalQty + newTotalQty;

  // Add line item row
  const handleAddRow = () => {
    setNewItems((prev) => [
      ...prev,
      { id: `coload-${Date.now()}-${prev.length + 1}`, model_id: '', quantity: 1 },
    ]);
  };

  // Remove line item row
  const handleRemoveRow = (rowId) => {
    setNewItems((prev) => {
      const filtered = prev.filter((it) => it.id !== rowId);
      return filtered.length > 0 ? filtered : [{ id: `coload-${Date.now()}`, model_id: '', quantity: 1 }];
    });
  };

  // Update line item
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
  }, [newItems, availableModels]);

  // Submit co-loading
  const handleSubmitCoLoad = async (e) => {
    e.preventDefault();

    const validItems = newItems.filter((it) => it.model_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      showToast(`Please add at least one cooler model to load from ${currentPlant} Plant.`, 'warning');
      return;
    }

    if (stockDeficits.length > 0) {
      showToast(
        `Insufficient stock for ${stockDeficits.map((d) => d.model_code).join(', ')}. Please adjust quantities.`,
        'error'
      );
      return;
    }

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
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete co-loading');
      }

      showToast(data.message || 'Vehicle fully loaded and dispatched!', 'success');
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
                  Stop 2 Loading
                </span>
              </h3>
              <p className="text-xs text-gray-500">
                Load remaining models from <strong>{currentPlant} Plant</strong> onto vehicle{' '}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
          <div>
            <span className="text-gray-500 block text-[11px]">Vehicle Number:</span>
            <span className="font-mono font-bold text-sm text-gray-900">{dispatch?.vehicle_number}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-[11px]">Party Destination:</span>
            <span className="font-bold text-primary-800 truncate block">{dispatch?.destination}</span>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-gray-500 block text-[11px]">Origin Plant (Stop 1):</span>
            <span className="font-semibold text-gray-900 flex items-center space-x-1">
              <span>{originMeta.icon}</span>
              <span>{originMeta.name}</span>
            </span>
          </div>
        </div>

        {/* SECTION 1: Already Loaded Items at Origin Plant (Read-Only) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center space-x-1.5">
              <span>🏭 Step 1: Already Loaded from {originPlant} Plant</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                {existingTotalQty} pcs on board
              </span>
            </h4>
          </div>

          <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl overflow-hidden">
            <table className="min-w-full divide-y divide-emerald-100 text-xs">
              <thead className="bg-emerald-100/60">
                <tr>
                  <th className="px-3 py-1.5 text-left font-bold text-emerald-900">Model Name</th>
                  <th className="px-3 py-1.5 text-left font-bold text-emerald-900">Code</th>
                  <th className="px-3 py-1.5 text-right font-bold text-emerald-900">Loaded Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-100/70 bg-white">
                {existingItems.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-2 text-gray-400 italic text-[11px]">
                      No previous items found.
                    </td>
                  </tr>
                ) : (
                  existingItems.map((it, idx) => (
                    <tr key={it.id || idx}>
                      <td className="px-3 py-1.5 font-semibold text-gray-900">{it.cooler_models?.name}</td>
                      <td className="px-3 py-1.5 font-mono text-gray-500">{it.cooler_models?.code}</td>
                      <td className="px-3 py-1.5 text-right font-bold text-emerald-800">
                        {it.quantity} pcs
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 2: Add Items from Current Plant */}
        <form onSubmit={handleSubmitCoLoad} className="space-y-3 pt-2 border-t border-gray-100">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center space-x-1.5">
              <span>🏭 Step 2: Load Items from {currentPlant} Plant</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${plantMeta.tagColor}`}>
                Current Stop
              </span>
            </h4>
            <button
              type="button"
              onClick={handleAddRow}
              className="text-xs font-bold text-primary-700 hover:text-primary-800 hover:underline flex items-center space-x-1"
            >
              <span>+ Add Another Model</span>
            </button>
          </div>

          {loadingModels ? (
            <div className="py-6 text-center">
              <LoadingSpinner message={`Loading ${currentPlant} models...`} size="sm" />
            </div>
          ) : (
            <div className="space-y-2">
              {newItems.map((item, index) => {
                const selectedModel = availableModels.find((m) => m.id === item.model_id);
                const currentStock = selectedModel?.current_stock ?? 0;
                const isOverStock = selectedModel && Number(item.quantity) > currentStock;

                return (
                  <div
                    key={item.id}
                    className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-indigo-900">
                        Item #{index + 1}
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
                          <option value="">-- Select Cooler Model ({currentPlant}) --</option>
                          {availableModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.code} - {m.name} (In Stock: {m.current_stock ?? 0} pcs)
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
                          Available at {currentPlant}:{' '}
                          <strong className={currentStock > 0 ? 'text-emerald-700' : 'text-red-600'}>
                            {currentStock} pcs
                          </strong>
                        </span>
                        {isOverStock && (
                          <span className="text-red-600 font-bold animate-pulse">
                            ⚠️ Exceeds available stock by {Number(item.quantity) - currentStock} pcs
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
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

          {/* Grand Total Summary Box */}
          <div className="p-3 bg-gradient-to-r from-gray-900 to-indigo-950 text-white rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[11px] text-gray-300 block uppercase tracking-wider font-semibold">
                Vehicle Consolidated Load Preview:
              </span>
              <span className="text-xs text-gray-300">
                {originPlant}: <strong>{existingTotalQty} pcs</strong> + {currentPlant}:{' '}
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
              disabled={submitting || newTotalQty <= 0 || stockDeficits.length > 0}
              className="btn-primary text-xs py-2 px-5 inline-flex items-center space-x-1.5 shadow-md font-bold"
            >
              <span>{submitting ? 'Confirming Loading...' : '✅ Complete Loading & Finalize Dispatch'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
