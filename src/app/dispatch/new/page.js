'use client';

import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import QRScanner from '@/components/QRScanner';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getSupabase } from '@/lib/supabase';

function NewDispatchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');

  const { employee } = useAuth();
  const { showToast } = useToast();
  const supabase = getSupabase();

  // Multi-step navigation: 1 = Vehicle Details, 2 = QR Scanning & Items, 3 = Review & Confirm
  const [currentStep, setCurrentStep] = useState(1);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(null); // { dispatchId, vehicleNumber, totalQty, status }
  const [countdown, setCountdown] = useState(3);

  // Form State - Step 1: Vehicle Details
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [fromLocation, setFromLocation] = useState('Jospo E41');
  const [destination, setDestination] = useState('');
  const [dispatchDate, setDispatchDate] = useState(todayStr);
  const [remarks, setRemarks] = useState('');

  // Items State - Step 2: Scanned & Manual Items
  // Item structure: { model_id, model_name, model_code, quantity, available_stock }
  const [items, setItems] = useState([]);

  // Catalog cache for instant offline/low-latency lookup
  const [modelsCatalog, setModelsCatalog] = useState([]);
  const [stockMap, setStockMap] = useState({}); // model_id -> stock quantity
  const [manualModelId, setManualModelId] = useState('');
  const [manualQuantity, setManualQuantity] = useState(1);

  // Live scan feedback banner
  const [lastScannedFeedback, setLastScannedFeedback] = useState(null); // { text, type: 'success' | 'warning' | 'error' }

  // Load models catalog and current stock
  const loadModelsAndStock = useCallback(async () => {
    try {
      // 1. Fetch cooler models
      const { data: models, error: modelsError } = await supabase
        .from('cooler_models')
        .select('*')
        .eq('is_active', true)
        .order('code', { ascending: true });

      if (modelsError) throw modelsError;
      setModelsCatalog(models || []);

      // 2. Fetch current stock view
      const { data: stocks, error: stocksError } = await supabase
        .from('current_stock')
        .select('*');

      if (!stocksError && stocks) {
        const map = {};
        stocks.forEach((s) => {
          map[s.model_id] = s.current_stock;
        });
        setStockMap(map);
      }
    } catch (err) {
      console.error('Error preloading models & stock:', err);
    }
  }, [supabase]);

  // Load existing draft if editing
  const loadExistingDraft = useCallback(async (id) => {
    try {
      setLoadingInitial(true);
      const { data: dispatch, error } = await supabase
        .from('dispatches')
        .select(`
          *,
          dispatch_items(
            id,
            quantity,
            model_id,
            cooler_models(id, name, code, qr_data)
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!dispatch) throw new Error('Dispatch record not found');

      if (dispatch.status !== 'draft') {
        showToast('Only draft dispatches can be edited.', 'warning');
        router.push('/dispatch');
        return;
      }

      setVehicleNumber(dispatch.vehicle_number || '');
      setFromLocation(dispatch.from_location || 'Jospo E41');
      setDestination(dispatch.destination || '');
      setDispatchDate(dispatch.dispatch_date || todayStr);
      setRemarks(dispatch.remarks || '');

      // Load items
      const loadedItems = (dispatch.dispatch_items || []).map((di) => ({
        model_id: di.model_id,
        model_name: di.cooler_models?.name || 'Cooler Model',
        model_code: di.cooler_models?.code || di.model_id,
        quantity: di.quantity,
        available_stock: 0, // Will be updated by stockMap
      }));

      setItems(loadedItems);
      // Auto move to step 2 if editing an existing draft
      setCurrentStep(2);
    } catch (err) {
      console.error('Error loading draft dispatch:', err);
      showToast(err.message || 'Failed to load draft dispatch', 'error');
      router.push('/dispatch');
    } finally {
      setLoadingInitial(false);
    }
  }, [supabase, showToast, router, todayStr]);

  // Initial data loading
  useEffect(() => {
    loadModelsAndStock();
    if (editId) {
      loadExistingDraft(editId);
    }
  }, [editId, loadModelsAndStock, loadExistingDraft]);

  // Keep items' available_stock synced with stockMap
  useEffect(() => {
    if (Object.keys(stockMap).length > 0) {
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          available_stock: stockMap[item.model_id] ?? item.available_stock ?? 0,
        }))
      );
    }
  }, [stockMap]);

  // Countdown timer on success redirect
  useEffect(() => {
    let timer;
    if (submissionSuccess) {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            router.push('/dispatch');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [submissionSuccess, router]);

  // Audio/vibration helper for scan
  const playScanTone = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  };

  // QR Scan Handler
  const handleScan = async (qrData) => {
    const cleanQr = (qrData || '').trim();
    if (!cleanQr) return;

    // First check local models catalog
    let model = modelsCatalog.find((m) => m.qr_data === cleanQr || m.code === cleanQr);

    // Fallback query if not in cache
    if (!model) {
      try {
        const { data: dbModel, error } = await supabase
          .from('cooler_models')
          .select('*')
          .eq('qr_data', cleanQr)
          .single();

        if (error || !dbModel) {
          setLastScannedFeedback({
            text: `Unrecognized QR: "${cleanQr}". No matching cooler model found.`,
            type: 'error',
          });
          showToast(`Unknown QR code: ${cleanQr}`, 'error');
          return;
        }
        model = dbModel;
      } catch (err) {
        showToast('Error validating QR code', 'error');
        return;
      }
    }

    // Get current stock
    let currentStock = stockMap[model.id];
    if (currentStock === undefined) {
      const { data: stockData } = await supabase
        .from('current_stock')
        .select('current_stock')
        .eq('model_id', model.id)
        .single();
      currentStock = stockData?.current_stock ?? 0;
      setStockMap((prev) => ({ ...prev, [model.id]: currentStock }));
    }

    playScanTone();

    // Increment or Add item
    setItems((prev) => {
      const existing = prev.find((item) => item.model_id === model.id);
      let updatedCount = 1;
      let newItems;

      if (existing) {
        updatedCount = existing.quantity + 1;
        newItems = prev.map((item) =>
          item.model_id === model.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        newItems = [
          ...prev,
          {
            model_id: model.id,
            model_name: model.name,
            model_code: model.code,
            quantity: 1,
            available_stock: currentStock,
          },
        ];
      }

      setLastScannedFeedback({
        text: `+1 ${model.code} (${model.name}) added! Total: ${updatedCount}`,
        type: updatedCount > currentStock ? 'warning' : 'success',
      });

      return newItems;
    });
  };

  // Manual Add Item
  const handleManualAdd = (e) => {
    e.preventDefault();
    if (!manualModelId) {
      showToast('Please choose a cooler model to add.', 'warning');
      return;
    }
    const qty = parseInt(manualQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast('Quantity must be greater than 0', 'warning');
      return;
    }

    const model = modelsCatalog.find((m) => m.id === manualModelId);
    if (!model) return;

    const availableStock = stockMap[model.id] ?? 0;

    setItems((prev) => {
      const existing = prev.find((item) => item.model_id === model.id);
      if (existing) {
        return prev.map((item) =>
          item.model_id === model.id ? { ...item, quantity: item.quantity + qty } : item
        );
      }
      return [
        ...prev,
        {
          model_id: model.id,
          model_name: model.name,
          model_code: model.code,
          quantity: qty,
          available_stock: availableStock,
        },
      ];
    });

    setManualModelId('');
    setManualQuantity(1);
    showToast(`Added ${qty} × ${model.code}`, 'success');
  };

  // Adjust item quantity
  const handleUpdateQuantity = (modelId, delta) => {
    setItems((prev) => {
      return prev
        .map((item) => {
          if (item.model_id === modelId) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  // Set quantity directly
  const handleSetExactQuantity = (modelId, newQty) => {
    const val = parseInt(newQty, 10);
    if (isNaN(val) || val <= 0) return;
    setItems((prev) =>
      prev.map((item) => (item.model_id === modelId ? { ...item, quantity: val } : item))
    );
  };

  // Remove item
  const handleRemoveItem = (modelId) => {
    setItems((prev) => prev.filter((item) => item.model_id !== modelId));
  };

  // Total Items Count
  const totalQuantity = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }, [items]);

  // Stock check: determine if any item exceeds available stock
  const stockDeficits = useMemo(() => {
    return items.filter((item) => item.quantity > item.available_stock);
  }, [items]);

  // Validation
  const isStep1Valid = vehicleNumber.trim() && destination.trim() && dispatchDate;
  const isStep2Valid = items.length > 0 && totalQuantity > 0;

  // Save as Draft
  const handleSaveAsDraft = async () => {
    if (!employee?.id) {
      showToast('Employee profile missing. Please log in again.', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('Cannot save empty dispatch. Please scan or add items.', 'warning');
      return;
    }

    try {
      setSubmitting(true);

      let targetDispatchId = editId;

      if (editId) {
        // Update existing header
        const { error: updateError } = await supabase
          .from('dispatches')
          .update({
            vehicle_number: vehicleNumber.trim().toUpperCase(),
            from_location: fromLocation.trim(),
            destination: destination.trim(),
            dispatch_date: dispatchDate,
            remarks: remarks.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editId)
          .eq('status', 'draft');

        if (updateError) throw updateError;

        // Delete existing items and re-insert
        const { error: delError } = await supabase
          .from('dispatch_items')
          .delete()
          .eq('dispatch_id', editId);

        if (delError) throw delError;
      } else {
        // Insert new draft dispatch
        const { data: newDispatch, error: insertError } = await supabase
          .from('dispatches')
          .insert({
            vehicle_number: vehicleNumber.trim().toUpperCase(),
            from_location: fromLocation.trim(),
            destination: destination.trim(),
            dispatch_date: dispatchDate,
            remarks: remarks.trim() || null,
            status: 'draft',
            employee_id: employee.id,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        targetDispatchId = newDispatch.id;
      }

      // Insert line items
      const itemsToInsert = items.map((item) => ({
        dispatch_id: targetDispatchId,
        model_id: item.model_id,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('dispatch_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      showToast('Dispatch draft saved successfully!', 'success');
      router.push('/dispatch');
    } catch (err) {
      console.error('Error saving draft dispatch:', err);
      showToast(err.message || 'Failed to save draft dispatch', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Dispatch (Atomic Stock Deduction)
  const handleConfirmDispatch = async () => {
    if (!employee?.id) {
      showToast('Employee profile missing. Please log in again.', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('Cannot confirm empty dispatch. Add at least one item.', 'warning');
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

      let targetDispatchId = editId;

      if (editId) {
        // Update existing header
        const { error: updateError } = await supabase
          .from('dispatches')
          .update({
            vehicle_number: vehicleNumber.trim().toUpperCase(),
            from_location: fromLocation.trim(),
            destination: destination.trim(),
            dispatch_date: dispatchDate,
            remarks: remarks.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editId);

        if (updateError) throw updateError;

        // Replace items
        await supabase.from('dispatch_items').delete().eq('dispatch_id', editId);
      } else {
        // Insert new draft dispatch record
        const { data: newDispatch, error: insertError } = await supabase
          .from('dispatches')
          .insert({
            vehicle_number: vehicleNumber.trim().toUpperCase(),
            from_location: fromLocation.trim(),
            destination: destination.trim(),
            dispatch_date: dispatchDate,
            remarks: remarks.trim() || null,
            status: 'draft',
            employee_id: employee.id,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        targetDispatchId = newDispatch.id;
      }

      // Insert line items
      const itemsToInsert = items.map((item) => ({
        dispatch_id: targetDispatchId,
        model_id: item.model_id,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('dispatch_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Call RPC confirm_dispatch to atomically verify and deduct stock
      const { data: rpcResult, error: rpcError } = await supabase.rpc('confirm_dispatch', {
        p_dispatch_id: targetDispatchId,
        p_employee_id: employee.id,
      });

      if (rpcError) throw rpcError;

      if (rpcResult && rpcResult.success === false) {
        throw new Error(rpcResult.error || 'Stock deduction failed during confirmation');
      }

      // Success screen
      setSubmissionSuccess({
        dispatchId: targetDispatchId,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        destination: destination.trim(),
        totalQty: totalQuantity,
        itemsCount: items.length,
      });

      showToast('Dispatch confirmed and stock deducted successfully!', 'success');
    } catch (err) {
      console.error('Error confirming dispatch:', err);
      showToast(err.message || 'Failed to confirm dispatch', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // SUCCESS SCREEN
  if (submissionSuccess) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center">
        <div className="card p-8 shadow-2xl border-emerald-200">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-3xl mx-auto mb-4 animate-bounce">
            ✓
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-1">Dispatch Confirmed!</h2>
          <p className="text-sm text-gray-600 mb-6">
            Stock ledger has been atomically updated and vehicle record is locked.
          </p>

          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 text-left text-sm space-y-2.5 mb-6">
            <div className="flex justify-between">
              <span className="text-gray-500">Vehicle Number:</span>
              <span className="font-mono font-bold text-gray-900">{submissionSuccess.vehicleNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Destination:</span>
              <span className="font-semibold text-gray-900">{submissionSuccess.destination}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total Units Loaded:</span>
              <span className="font-bold text-emerald-700">{submissionSuccess.totalQty} coolers</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Models Loaded:</span>
              <span className="font-semibold text-gray-800">{submissionSuccess.itemsCount} model types</span>
            </div>
          </div>

          <p className="text-xs text-gray-500 mb-6">
            Redirecting to dispatch dashboard in <strong className="text-primary-600">{countdown}</strong> seconds...
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dispatch" className="btn-primary text-sm py-2 px-5">
              Go to Dispatch List
            </Link>
            <button
              type="button"
              onClick={() => {
                setSubmissionSuccess(null);
                setItems([]);
                setVehicleNumber('');
                setDestination('');
                setRemarks('');
                setCurrentStep(1);
              }}
              className="btn-secondary text-sm py-2 px-5"
            >
              Scan Another Vehicle
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loadingInitial) {
    return (
      <div className="py-20 text-center">
        <LoadingSpinner message="Loading draft dispatch details..." size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2 text-xs text-gray-500 mb-1">
            <Link href="/dispatch" className="hover:text-primary-600">
              ← Back to Dispatches
            </Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">
              {editId ? 'Edit Draft' : 'New Dispatch'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {editId ? 'Edit Draft Dispatch' : 'New Cooler Dispatch'}
          </h1>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-100 text-primary-800">
          📱 Mobile Scanner
        </span>
      </div>

      {/* Progress Stepper Bar */}
      <div className="grid grid-cols-3 gap-2 p-1.5 bg-gray-100 rounded-xl text-center text-xs font-semibold">
        <button
          type="button"
          onClick={() => setCurrentStep(1)}
          className={`py-2 px-2 rounded-lg transition-all ${
            currentStep === 1
              ? 'bg-white text-primary-700 shadow-sm font-bold'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          1. Vehicle Info
        </button>
        <button
          type="button"
          onClick={() => isStep1Valid && setCurrentStep(2)}
          disabled={!isStep1Valid}
          className={`py-2 px-2 rounded-lg transition-all ${
            currentStep === 2
              ? 'bg-white text-primary-700 shadow-sm font-bold'
              : isStep1Valid
              ? 'text-gray-600 hover:text-gray-900'
              : 'text-gray-400 cursor-not-allowed opacity-60'
          }`}
        >
          2. QR Scanning ({totalQuantity})
        </button>
        <button
          type="button"
          onClick={() => isStep1Valid && isStep2Valid && setCurrentStep(3)}
          disabled={!isStep1Valid || !isStep2Valid}
          className={`py-2 px-2 rounded-lg transition-all ${
            currentStep === 3
              ? 'bg-white text-primary-700 shadow-sm font-bold'
              : isStep1Valid && isStep2Valid
              ? 'text-gray-600 hover:text-gray-900'
              : 'text-gray-400 cursor-not-allowed opacity-60'
          }`}
        >
          3. Review & Confirm
        </button>
      </div>

      {/* STEP 1: VEHICLE DETAILS */}
      {currentStep === 1 && (
        <div className="card space-y-5 animate-fadeIn">
          <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Step 1: Vehicle & Route Information</h2>
              <p className="text-xs text-gray-500">Enter vehicle registration and destination details</p>
            </div>
            <span className="text-2xl">🚛</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Vehicle Number */}
            <div className="sm:col-span-2">
              <label htmlFor="vehicleNumber" className="label">
                Vehicle Registration Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="vehicleNumber"
                  type="text"
                  required
                  placeholder="e.g. MP09 AB 1234, DL01 CA 5566"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                  className="input-field font-mono font-bold uppercase tracking-wider text-base"
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Enter license plate number of the loading vehicle or truck.
              </p>
            </div>

            {/* From Location */}
            <div>
              <label htmlFor="fromLocation" className="label">
                From Location (Origin) <span className="text-red-500">*</span>
              </label>
              <input
                id="fromLocation"
                type="text"
                required
                value={fromLocation}
                onChange={(e) => setFromLocation(e.target.value)}
                className="input-field"
              />
            </div>

            {/* Destination */}
            <div>
              <label htmlFor="destination" className="label">
                Destination <span className="text-red-500">*</span>
              </label>
              <input
                id="destination"
                type="text"
                required
                placeholder="e.g. Bhopal Central Hub, Indore Depot"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="input-field"
              />
            </div>

            {/* Dispatch Date */}
            <div>
              <label htmlFor="dispatchDate" className="label">
                Dispatch Date <span className="text-red-500">*</span>
              </label>
              <input
                id="dispatchDate"
                type="date"
                required
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
                className="input-field"
              />
            </div>

            {/* Dispatch Staff */}
            <div>
              <label className="label">Dispatch Officer</label>
              <input
                type="text"
                disabled
                value={employee?.name ? `${employee.name} (${employee.role})` : 'Current Employee'}
                className="input-field bg-gray-50 text-gray-600"
              />
            </div>

            {/* Remarks */}
            <div className="sm:col-span-2">
              <label htmlFor="remarks" className="label">
                Remarks / Driver Details (Optional)
              </label>
              <textarea
                id="remarks"
                rows={2}
                placeholder="e.g. Driver Ramesh (Ph: 9876543210), fragile delivery, seal #4829"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button
              type="button"
              disabled={!isStep1Valid}
              onClick={() => setCurrentStep(2)}
              className="btn-primary text-sm py-2.5 px-6 inline-flex items-center space-x-2"
            >
              <span>Proceed to Scanning</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: QR SCANNING & ITEM ENTRY */}
      {currentStep === 2 && (
        <div className="space-y-6 animate-fadeIn">
          {/* Vehicle mini-summary banner */}
          <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="font-mono font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-primary-200">
                {vehicleNumber}
              </span>
              <span className="text-gray-500">→</span>
              <span className="font-medium text-gray-800">{destination}</span>
            </div>
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="text-primary-700 hover:text-primary-900 font-semibold underline"
            >
              Edit Route
            </button>
          </div>

          {/* QR Scanner Component */}
          <div>
            <QRScanner
              isActive={currentStep === 2}
              onScan={handleScan}
              onError={(err) => console.warn('QR Scanner reported:', err)}
            />
          </div>

          {/* Live Feedback Banner from Last Scan */}
          {lastScannedFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between animate-fadeIn ${
                lastScannedFeedback.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : lastScannedFeedback.type === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <div className="flex items-center space-x-2">
                <span>
                  {lastScannedFeedback.type === 'error'
                    ? '❌'
                    : lastScannedFeedback.type === 'warning'
                    ? '⚠️'
                    : '✅'}
                </span>
                <span>{lastScannedFeedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setLastScannedFeedback(null)}
                className="text-gray-400 hover:text-gray-600 ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* Scanned Items Table & Running Total */}
          <div className="card p-0 overflow-hidden border border-gray-200">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Loaded Coolers</h3>
                <p className="text-xs text-gray-500">Scan QR codes or manually adjust counts</p>
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-primary-100 text-primary-800">
                Total: {totalQuantity} units
              </span>
            </div>

            {items.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">
                <div className="text-3xl mb-2">📷</div>
                <p className="font-semibold text-gray-700">No items scanned yet.</p>
                <p className="mt-1">
                  Point the camera at a model QR code (e.g. JOSPO-J50) or use the manual entry below.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {items.map((item) => {
                  const hasDeficit = item.quantity > item.available_stock;
                  return (
                    <div
                      key={item.model_id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/60 transition-colors"
                    >
                      {/* Left info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-sm text-primary-800 bg-primary-50 px-2 py-0.5 rounded border border-primary-200">
                            {item.model_code}
                          </span>
                          <span className="text-sm font-semibold text-gray-900 truncate">
                            {item.model_name}
                          </span>
                        </div>
                        <div className="flex items-center space-x-3 text-xs mt-1">
                          <span className="text-gray-500">
                            Available in Stock:{' '}
                            <strong className={hasDeficit ? 'text-red-600' : 'text-gray-800'}>
                              {item.available_stock}
                            </strong>
                          </span>
                          {hasDeficit && (
                            <span className="badge-danger text-[10px]">
                              Insufficient Stock (-{item.quantity - item.available_stock})
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right controls: +/- buttons and remove */}
                      <div className="flex items-center space-x-2 justify-end">
                        <div className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden shadow-sm">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.model_id, -1)}
                            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold focus:outline-none"
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleSetExactQuantity(item.model_id, e.target.value)}
                            className="w-14 text-center font-bold text-sm text-gray-900 focus:outline-none border-x border-gray-200 py-1"
                          />
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.model_id, 1)}
                            className="w-8 h-8 flex items-center justify-center text-gray-600 hover:bg-gray-100 font-bold focus:outline-none"
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.model_id)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          title="Remove model"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Running Total Footer */}
            {items.length > 0 && (
              <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs font-bold text-gray-800">
                <span>Unique Models: {items.length}</span>
                <span className="text-sm text-primary-700">Total Units: {totalQuantity}</span>
              </div>
            )}
          </div>

          {/* Manual Model Addition Card */}
          <div className="card p-4 bg-gray-50/50 border border-dashed border-gray-300 space-y-3">
            <div className="flex items-center space-x-2">
              <span className="text-sm">✍️</span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                Manual Item Entry (Without QR)
              </h4>
            </div>
            <form onSubmit={handleManualAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-7">
                <label htmlFor="manualModel" className="label text-xs">
                  Cooler Model
                </label>
                <select
                  id="manualModel"
                  value={manualModelId}
                  onChange={(e) => setManualModelId(e.target.value)}
                  className="input-field text-xs py-2"
                >
                  <option value="">-- Select Cooler Model --</option>
                  {modelsCatalog.map((m) => {
                    const stock = stockMap[m.id] ?? 0;
                    return (
                      <option key={m.id} value={m.id}>
                        {m.code} - {m.name} (Stock: {stock})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label htmlFor="manualQty" className="label text-xs">
                  Qty
                </label>
                <input
                  id="manualQty"
                  type="number"
                  min="1"
                  value={manualQuantity}
                  onChange={(e) => setManualQuantity(e.target.value)}
                  className="input-field text-xs py-2 text-center"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={!manualModelId}
                  className="btn-secondary text-xs w-full py-2 disabled:opacity-50"
                >
                  + Add
                </button>
              </div>
            </form>
          </div>

          {/* Step 2 Bottom Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="btn-secondary text-xs py-2.5 px-4 w-full sm:w-auto"
            >
              ← Back to Vehicle Info
            </button>

            <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleSaveAsDraft}
                disabled={submitting || items.length === 0}
                className="btn-secondary text-xs py-2.5 px-4 w-full sm:w-auto"
              >
                Save as Draft
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                disabled={!isStep2Valid}
                className="btn-primary text-xs py-2.5 px-6 w-full sm:w-auto"
              >
                Review & Confirm →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: REVIEW & CONFIRM */}
      {currentStep === 3 && (
        <div className="card space-y-6 animate-fadeIn">
          <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Step 3: Review & Final Confirmation</h2>
              <p className="text-xs text-gray-500">
                Verify vehicle details and stock balance before finalizing
              </p>
            </div>
            <span className="text-2xl">📋</span>
          </div>

          {/* Vehicle summary card */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-gray-500 block">Vehicle Number:</span>
              <span className="font-mono font-bold text-base text-gray-900">{vehicleNumber}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Dispatch Date:</span>
              <span className="font-semibold text-gray-900">{dispatchDate}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Dispatch Officer:</span>
              <span className="font-semibold text-gray-900">{employee?.name || 'Staff'}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Origin:</span>
              <span className="font-medium text-gray-900">{fromLocation}</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-500 block">Destination:</span>
              <span className="font-semibold text-primary-800">{destination}</span>
            </div>
            {remarks && (
              <div className="col-span-2 sm:col-span-3 pt-2 border-t border-gray-200">
                <span className="text-gray-500 block">Remarks:</span>
                <span className="text-gray-700 italic">{remarks}</span>
              </div>
            )}
          </div>

          {/* Stock Deficit Warning Banner */}
          {stockDeficits.length > 0 && (
            <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 text-xs text-rose-900">
              <div className="flex items-center space-x-2 font-bold mb-1 text-sm text-rose-700">
                <span>⚠️</span>
                <span>Insufficient Stock Detected!</span>
              </div>
              <p className="mb-2 leading-relaxed">
                The required dispatch quantity exceeds active inventory for the following cooler models:
              </p>
              <ul className="list-disc list-inside space-y-1 font-semibold">
                {stockDeficits.map((d) => (
                  <li key={d.model_id}>
                    {d.model_code} ({d.model_name}): Requested {d.quantity} units, but only{' '}
                    {d.available_stock} available in stock.
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-rose-700">
                You can save this as a draft, but the system will block confirmation until inventory is replenished or quantities are reduced.
              </p>
            </div>
          )}

          {/* Model Breakdown Table */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Model</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-600">Available Stock</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Dispatch Qty</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-600">Remaining Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {items.map((item) => {
                  const deficit = item.quantity > item.available_stock;
                  const remaining = item.available_stock - item.quantity;
                  return (
                    <tr key={item.model_id} className={deficit ? 'bg-rose-50/50' : ''}>
                      <td className="px-3 py-3">
                        <span className="font-mono font-bold text-primary-800">{item.model_code}</span>
                        <span className="block text-gray-600 text-[11px]">{item.model_name}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-700 font-medium">
                        {item.available_stock} units
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900">
                        {item.quantity} units
                      </td>
                      <td className="px-3 py-3 text-right font-bold">
                        <span className={deficit ? 'text-red-600' : 'text-emerald-700'}>
                          {remaining} units
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200 font-bold text-xs text-gray-900">
                <tr>
                  <td colSpan={2} className="px-3 py-3 text-left">
                    TOTAL UNITS TO DISPATCH
                  </td>
                  <td colSpan={2} className="px-3 py-3 text-right text-base text-primary-700">
                    {totalQuantity} units
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              disabled={submitting}
              className="btn-secondary text-xs py-2.5 px-4 w-full sm:w-auto"
            >
              ← Back to QR Scanning
            </button>

            <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={handleSaveAsDraft}
                disabled={submitting}
                className="btn-secondary text-xs py-2.5 px-5 w-full sm:w-auto"
              >
                {submitting ? 'Saving...' : 'Save as Draft'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDispatch}
                disabled={submitting || stockDeficits.length > 0}
                className="btn-success text-xs py-2.5 px-6 shadow-sm w-full sm:w-auto font-bold"
              >
                {submitting ? 'Confirming Dispatch...' : 'Confirm & Deduct Stock ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NewDispatchPage() {
  return (
    <AppShell allowedRoles={['admin', 'dispatch']}>
      <Suspense
        fallback={
          <div className="py-20 text-center">
            <LoadingSpinner message="Loading dispatch workstation..." size="lg" />
          </div>
        }
      >
        <NewDispatchContent />
      </Suspense>
    </AppShell>
  );
}
