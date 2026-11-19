'use client';

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import QRScanner from '@/components/QRScanner';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getSupabase } from '@/lib/supabase';
import { getTodayIST } from '@/lib/date';
import SearchableSelect from '@/components/SearchableSelect';
import DeliveryChallanModal from '@/components/DeliveryChallanModal';
import { resolveDispatchType, formatDispatchRemarks, cleanDispatchRemarks } from '@/lib/dispatch';

// Static 20 models registry to ensure zero-latency & offline scanning fallback
export const JOSPO_20_ACTIVE_MODELS = [
  { code: 'ICECOOL-55-CG-WG', name: 'Jospo Icecool 55 CG WG', qr_data: 'JOSPO-ICECOOL55CGWG' },
  { code: 'ICECOOL-55-NCG-WG', name: 'Jospo Icecool 55 NCG WG', qr_data: 'JOSPO-ICECOOL55LNCGWG' },
  { code: 'ICECOOL-65-CG-WG', name: 'Jospo Icecool 65 CG WG', qr_data: 'JOSPO-ICECOOL65LCGWG' },
  { code: 'ICECOOL-65-NCG-WG', name: 'Jospo Icecool 65 NCG WG', qr_data: 'JOSPO-ICECOOL65LNCGWG' },
  { code: 'NEO-100-CG-WG', name: 'Jospo Neo 100 CG WG', qr_data: 'JOSPO-NEO100CGWG' },
  { code: 'NEO-100-NCG-WG', name: 'Jospo Neo 100 NCG WG', qr_data: 'JOSPO-NEO100NCGWG' },
  { code: 'NEO-80-CG-WG', name: 'Jospo Neo 80 CG WG', qr_data: 'JOSPO-NEO80CGWG' },
  { code: 'NEO-80-NCG-WG', name: 'Jospo Neo 80 NCG WG', qr_data: 'JOSPO-NEO80NCGWG' },
  { code: 'ROLEX-35-CG-DG', name: 'Jospo Rolex 35 CG DG', qr_data: 'JOSPO-ROLEX35CGDG' },
  { code: 'ROLEX-35-CG-WG', name: 'Jospo Rolex 35 CG WG', qr_data: 'JOSPO-ROLEX35CGWG' },
  { code: 'ROLEX-35-NCG-DG', name: 'Jospo Rolex 35 NCG DG', qr_data: 'JOSPO-ROLEX35NCGDG' },
  { code: 'ROLEX-35-NCG-WG', name: 'Jospo Rolex 35 NCG WG', qr_data: 'JOSPO-ROLEX35NCGWG' },
  { code: 'ROLEX-65-CG-DG', name: 'Jospo Rolex 65 CG DG', qr_data: 'JOSPO-ROLEX65CGDG' },
  { code: 'ROLEX-65-CG-WG', name: 'Jospo Rolex 65 CG WG', qr_data: 'JOSPO-ROLEX65CGWG' },
  { code: 'ROLEX-65-NCG-DG', name: 'Jospo Rolex 65 NCG DG', qr_data: 'JOSPO-ROLEX65NCGDG' },
  { code: 'ROLEX-65-NCG-WG', name: 'Jopso Rolex 65 NCG WG', qr_data: 'JOSPO-JOPSOROLEX65NCGWG' },
  { code: 'SHINE-100-CG-WG', name: 'Jospo Shine 100 CG WG', qr_data: 'JOSPO-SHINE100CGWG' },
  { code: 'SHINE-100-NCG-WG', name: 'Jospo Shine 100 NCG WG', qr_data: 'JOSPO-SHINE100NCGWG' },
  { code: 'SHINE-80-CG-WG', name: 'Jospo Shine 80 CG WG', qr_data: 'JOSPO-SHINE80CGWG' },
  { code: 'SHINE-80-NCG-WG', name: 'Jospo Shine 80 NCG WG', qr_data: 'JOSPO-SHINE80NCGWG' },
];

function cleanAlphanumeric(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getSignatures(str) {
  if (!str) return [];
  const base = cleanAlphanumeric(str);
  const withoutBrand = base.replace(/^(?:jospo|jopso|jsp)/, '');
  const withoutL = withoutBrand.replace(/(\d+)l([a-z]+)/, '$1$2');
  const withL = withoutBrand.replace(/(\d+)(cg|ncg)/, '$1l$2');
  return Array.from(new Set([base, withoutBrand, withoutL, withL])).filter(Boolean);
}

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
  const [showChallanModal, setShowChallanModal] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [existingDispatchStatus, setExistingDispatchStatus] = useState(null);
  const [dispatchType, setDispatchType] = useState('party'); // 'party' | 'local'

  // Form State - Step 1: Vehicle Details
  const todayStr = useMemo(() => getTodayIST(), []);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [fromLocation, setFromLocation] = useState('Jospo E41');
  const [destination, setDestination] = useState('');
  const [dispatchDate, setDispatchDate] = useState(todayStr);
  const [remarks, setRemarks] = useState('');

  // Items State - Step 2: Scanned & Manual Items
  // Item structure: { model_id, model_name, model_code, quantity, available_stock, scanned_serials: [] }
  const [items, setItems] = useState([]);

  // Catalog cache for instant offline/low-latency lookup
  const [modelsCatalog, setModelsCatalog] = useState([]);
  const [stockMap, setStockMap] = useState({}); // model_id -> stock quantity
  const [manualModelId, setManualModelId] = useState('');
  const [manualQuantity, setManualQuantity] = useState(1);

  const DISPATCH_DRAFT_KEY = 'jospo_dispatch_draft_v1';
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftInfo, setDraftInfo] = useState(null); // { vehicle, destination, totalQty, itemCount, savedAt }
  const isDraftInitializedRef = useRef(false);
  const feedbackTimerRef = useRef(null);

  // Live scan feedback banner
  const [lastScannedFeedback, setLastScannedFeedback] = useState(null); // { text, type: 'success' | 'warning' | 'error' | 'duplicate' }
  const [lastScannedModel, setLastScannedModel] = useState(null); // { model_id, model_code, model_name, timestamp }
  const [scannedUnitIds, setScannedUnitIds] = useState(new Set()); // State for UI rendering

  // Synchronous duplicate protection store & scan mutex
  const scannedUnitIdsRef = useRef(new Set());
  const isProcessingScanRef = useRef(false);
  const lastNonUniqueScanTimeRef = useRef(new Map());

  // Hardware barcode scanner gun input & buffer
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeBufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);

  // Load models catalog and current stock (with multi-tier fallback)
  const loadModelsAndStock = useCallback(async () => {
    try {
      let loadedModels = [];
      let loadedStocks = {};

      // 1. Try fetching via API route
      try {
        const res = await fetch('/api/models?active_only=true');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.models?.length > 0) {
            loadedModels = data.models;
            data.models.forEach((m) => {
              loadedStocks[m.id] = m.current_stock ?? 0;
            });
          }
        }
      } catch (apiErr) {
        console.warn('API models fetch fallback to direct supabase:', apiErr);
      }

      // 2. Fallback to direct supabase query
      if (loadedModels.length === 0 && supabase) {
        const { data: models, error: modelsError } = await supabase
          .from('cooler_models')
          .select('*')
          .eq('is_active', true)
          .order('code', { ascending: true });

        if (!modelsError && models) {
          loadedModels = models;
        }

        const { data: stocks } = await supabase.from('current_stock').select('*');
        if (stocks) {
          stocks.forEach((s) => {
            loadedStocks[s.model_id] = s.current_stock;
          });
        }
      }

      // 3. Fallback to JOSPO_20_ACTIVE_MODELS registry if offline or empty
      if (loadedModels.length === 0) {
        loadedModels = JOSPO_20_ACTIVE_MODELS.map((m, idx) => ({
          id: `local-model-${idx + 1}`,
          ...m,
          is_active: true,
        }));
      }

      setModelsCatalog(loadedModels);
      setStockMap(loadedStocks);
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

      const isAdmin = employee?.role === 'admin';
      if (dispatch.status !== 'draft' && !isAdmin) {
        showToast('Only draft dispatches can be edited.', 'warning');
        router.push('/dispatch');
        return;
      }

      setExistingDispatchStatus(dispatch.status);
      setDispatchType(resolveDispatchType(dispatch));

      setVehicleNumber(dispatch.vehicle_number || '');
      setFromLocation(dispatch.from_location || 'Jospo E41');
      setDestination(dispatch.destination || '');
      setDispatchDate(dispatch.dispatch_date || todayStr);
      setRemarks(cleanDispatchRemarks(dispatch.remarks) || '');

      // Load items
      const loadedItems = (dispatch.dispatch_items || []).map((di) => ({
        model_id: di.model_id,
        model_name: di.cooler_models?.name || 'Cooler Model',
        model_code: di.cooler_models?.code || di.model_id,
        quantity: di.quantity,
        available_stock: 0, // Will be updated by stockMap
      }));

      setItems(loadedItems);
      // Auto move to step 2 if editing an existing dispatch
      setCurrentStep(2);
    } catch (err) {
      console.error('Error loading dispatch:', err);
      showToast(err.message || 'Failed to load dispatch', 'error');
      router.push('/dispatch');
    } finally {
      setLoadingInitial(false);
    }
  }, [supabase, showToast, router, todayStr, employee]);

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

  // Restore persistent draft on mount (survives tab close / accidental navigation / battery death)
  useEffect(() => {
    if (editId) {
      isDraftInitializedRef.current = true;
      return;
    }

    try {
      if (typeof window !== 'undefined') {
        const savedDraft = localStorage.getItem(DISPATCH_DRAFT_KEY);
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          const hasItems = Array.isArray(parsed?.items) && parsed.items.length > 0;
          const hasVehicle = Boolean(parsed?.vehicleNumber?.trim());

          if (hasItems || hasVehicle) {
            if (parsed.vehicleNumber) setVehicleNumber(parsed.vehicleNumber);
            if (parsed.fromLocation) setFromLocation(parsed.fromLocation);
            if (parsed.destination) setDestination(parsed.destination);
            if (parsed.dispatchDate) setDispatchDate(parsed.dispatchDate);
            if (parsed.remarks) setRemarks(parsed.remarks);

            if (hasItems) {
              setItems(parsed.items);
              const restoredIds = Array.isArray(parsed.scannedUnitIds) && parsed.scannedUnitIds.length > 0
                ? parsed.scannedUnitIds
                : parsed.items.flatMap((i) => (i.scanned_serials || []).map((s) => `${i.model_code}::${s}`));

              scannedUnitIdsRef.current = new Set(restoredIds);
              setScannedUnitIds(new Set(restoredIds));
              setCurrentStep(parsed.currentStep || 2);
            } else {
              setCurrentStep(parsed.currentStep || 1);
            }

            const totalLoadedQty = (parsed.items || []).reduce(
              (sum, item) => sum + (Number(item.quantity) || 0),
              0
            );

            setDraftRestored(true);
            setDraftInfo({
              vehicle: parsed.vehicleNumber || 'Unassigned Vehicle',
              destination: parsed.destination || '',
              totalQty: totalLoadedQty,
              itemCount: parsed.items?.length || 0,
              savedAt: parsed.savedAt
                ? new Date(parsed.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '',
            });
          }
        }
      }
    } catch (err) {
      console.warn('Could not restore dispatch draft from storage:', err);
    } finally {
      isDraftInitializedRef.current = true;
    }
  }, [editId]);

  // Auto-save active draft into localStorage on every change
  useEffect(() => {
    if (editId || !isDraftInitializedRef.current || submissionSuccess) return;

    try {
      if (typeof window !== 'undefined') {
        const hasContent = Boolean(vehicleNumber.trim()) || items.length > 0;
        if (hasContent) {
          const snapshot = {
            vehicleNumber,
            fromLocation,
            destination,
            dispatchDate,
            remarks,
            items,
            scannedUnitIds: Array.from(scannedUnitIdsRef.current),
            currentStep,
            savedAt: Date.now(),
          };
          localStorage.setItem(DISPATCH_DRAFT_KEY, JSON.stringify(snapshot));
        }
      }
    } catch (err) {
      console.warn('Auto-save error:', err);
    }
  }, [
    vehicleNumber,
    fromLocation,
    destination,
    dispatchDate,
    remarks,
    items,
    currentStep,
    editId,
    submissionSuccess,
  ]);

  // Clean up feedback timer on unmount
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // Audio/vibration helper for scan success
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

  // Audio/vibration helper for duplicate or rejected scan
  const playRejectTone = () => {
    try {
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([180, 80, 180]);
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, ctx.currentTime); // Low warning buzz
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } catch (e) {}
  };

  // Universal parser for BarTender & manufacturing QR codes
  // Supports formats:
  // - JSP|Model Name|000001 or JSP|Model Code|000001 (BarTender pipe-delimited)
  // - JOSPO-ROLEX-35-CG-WG-000001 (BarTender hyphen-delimited)
  // - JOSPO-ROLEX35CGWG-000001 or JOSPO-ROLEX35CGWG000001
  // - ROLEX-35-CG-WG#000001 or ROLEX-35-CG-WG 000001 or ROLEX-35-CG-WG-000001
  // - Base model QRs without serial (backward compatibility fallback)
  const parseScannedQr = (rawQr, catalog = []) => {
    const clean = (rawQr || '').trim();
    if (!clean) return null;

    const effectiveCatalog = (catalog && catalog.length > 0)
      ? [...catalog]
      : [...JOSPO_20_ACTIVE_MODELS];

    const findMatchingModel = (modelCandidate) => {
      const candSigs = getSignatures(modelCandidate);
      return effectiveCatalog.find((m) => {
        const mSigs = [
          ...getSignatures(m.code),
          ...getSignatures(m.name),
          ...getSignatures(m.qr_data),
        ];
        return candSigs.some((sig) => mSigs.includes(sig));
      });
    };

    // 1. Pipe delimited format: JSP|Jospo Icecool 55 CG WG|000001 or JSP|ICECOOL-55-CG-WG|000001
    if (clean.includes('|')) {
      const parts = clean.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const serialPart = parts[parts.length - 1];
        const modelPart = parts[parts.length - 2];
        const matched = findMatchingModel(modelPart);

        if (matched) {
          const cleanSerial = serialPart.replace(/^[#\-_\s]+/, '').toUpperCase();
          return {
            modelCode: matched.code,
            matchedModel: matched,
            uniqueId: `${matched.code}::${cleanSerial}`,
            serialNumber: cleanSerial,
            isUnique: true,
            rawQr: clean,
          };
        }
      }
    }

    // 2. Hash delimited format: ICECOOL-55-CG-WG#000001
    if (clean.includes('#')) {
      const [modelPart, ...serialParts] = clean.split('#');
      const serialPart = serialParts.join('#').trim();
      const matched = findMatchingModel(modelPart);
      if (matched) {
        const cleanSerial = serialPart.replace(/^[#\-_\s]+/, '').toUpperCase();
        return {
          modelCode: matched.code,
          matchedModel: matched,
          uniqueId: `${matched.code}::${cleanSerial}`,
          serialNumber: cleanSerial,
          isUnique: true,
          rawQr: clean,
        };
      }
    }

    // 3. Exact match check (Non-unique model-only scan without serial)
    const inputSigs = getSignatures(clean);
    for (const m of effectiveCatalog) {
      const mSigs = [
        ...getSignatures(m.code),
        ...getSignatures(m.qr_data),
        ...getSignatures(m.name),
      ];

      if (inputSigs.some((sig) => mSigs.includes(sig))) {
        return {
          modelCode: m.code,
          matchedModel: m,
          uniqueId: null,
          serialNumber: null,
          isUnique: false,
          rawQr: clean,
        };
      }
    }

    // 4. Prefix matching for serialized codes:
    // e.g. JOSPO-ICECOOL-55-CG-WG-000001, JOSPO-ICECOOL55CGWG-000001, ICECOOL-55-CG-WG-000001, JOSPO-ICECOOL55CGWG000001
    const sortedCatalog = [...effectiveCatalog].sort((a, b) => b.code.length - a.code.length);
    const normInput = cleanAlphanumeric(clean);
    const normInputNoBrand = normInput.replace(/^(?:jospo|jopso|jsp)/, '');

    for (const m of sortedCatalog) {
      const mSigs = [
        ...getSignatures(m.code),
        ...getSignatures(m.qr_data),
        ...getSignatures(m.name),
      ].sort((a, b) => b.length - a.length);

      for (const pref of mSigs) {
        const targetStr = normInputNoBrand.startsWith(pref)
          ? normInputNoBrand
          : normInput.startsWith(pref)
          ? normInput
          : null;

        if (targetStr && targetStr.length > pref.length) {
          const rawRemainder = targetStr.slice(pref.length);
          const remainingNorm = rawRemainder.replace(/^(?:sn|box|no|ser|serial)/, '');
          if (remainingNorm.length >= 1 && /\d/.test(remainingNorm)) {
            let serialToDisplay = remainingNorm;
            const matchTrailingDigits = clean.match(/[-_#\s/:]*([A-Za-z0-9]+)$/);
            if (matchTrailingDigits && matchTrailingDigits[1]) {
              serialToDisplay = matchTrailingDigits[1].replace(/^(?:sn|box|no|ser|serial)/i, '');
            }

            const cleanSerial = serialToDisplay.replace(/^[#\-_\s:]+/, '').toUpperCase();
            return {
              modelCode: m.code,
              matchedModel: m,
              uniqueId: `${m.code}::${cleanSerial}`,
              serialNumber: cleanSerial,
              isUnique: true,
              rawQr: clean,
            };
          }
        }
      }
    }

    // Fallback unrecognized
    return {
      modelCode: clean,
      matchedModel: null,
      uniqueId: null,
      serialNumber: null,
      isUnique: false,
      rawQr: clean,
    };
  };

  // QR Scan Handler
  const handleScan = async (qrData) => {
    const cleanQr = (qrData || '').trim();
    if (!cleanQr) return;

    // Mutex: Prevent concurrent / rapid double executions
    if (isProcessingScanRef.current) {
      return;
    }
    isProcessingScanRef.current = true;

    try {
      // Parse the QR code (extracts model and unique box serial)
      const parsed = parseScannedQr(cleanQr, modelsCatalog);
      if (!parsed || !parsed.matchedModel) {
        playRejectTone();
        setLastScannedFeedback({
          text: `Unrecognized QR: "${cleanQr}". No matching cooler model found.`,
          type: 'error',
        });
        showToast(`Unknown QR: ${cleanQr.slice(0, 32)}`, 'error');
        return;
      }

      const { matchedModel, modelCode, uniqueId, serialNumber, isUnique } = parsed;

      // 1. DUPLICATE CHECK: Has this specific physical box already been scanned in this dispatch?
      if (isUnique && uniqueId) {
        // SYNCHRONOUS REF CHECK: 100% immune to stale closures and asynchronous state batching!
        if (scannedUnitIdsRef.current.has(uniqueId)) {
          playRejectTone();
          setLastScannedFeedback({
            text: `⚠️ Box #${serialNumber} (${matchedModel.name}) is ALREADY LOADED in this truck (Skipped)`,
            type: 'duplicate',
          });
          if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
          feedbackTimerRef.current = setTimeout(() => {
            setLastScannedFeedback((prev) => (prev?.type === 'duplicate' ? null : prev));
          }, 3500);
          return;
        }

        // IMMEDIATELY register in ref synchronously BEFORE any async action or state dispatch!
        scannedUnitIdsRef.current.add(uniqueId);
        setScannedUnitIds(new Set(scannedUnitIdsRef.current));
      } else {
        // NON-UNIQUE MODEL QR (e.g. bulk QR without serial):
        // Enforce a strict minimum 1200ms rate-limit on the same model code to prevent camera dwell multiple increments
        const lastScanTime = lastNonUniqueScanTimeRef.current.get(modelCode) || 0;
        if (Date.now() - lastScanTime < 1200) {
          return;
        }
        lastNonUniqueScanTimeRef.current.set(modelCode, Date.now());
      }

      // 2. Resolve database row (or matchedModel fallback)
      let model = modelsCatalog.find((m) => m.code === modelCode || m.id === matchedModel.id);
      if (!model) {
        try {
          const { data: dbModel } = await supabase
            .from('cooler_models')
            .select('*')
            .eq('code', modelCode)
            .single();
          model = dbModel || matchedModel;
        } catch (err) {
          model = matchedModel;
        }
      }

      // Get current stock
      let currentStock = stockMap[model.id] ?? 0;

      // 3. Play crisp positive confirmation chime
      playScanTone();

      // 4. Increment or Add item
      setItems((prev) => {
        const existing = prev.find(
          (item) => item.model_id === model.id || item.model_code === model.code
        );
        let updatedCount = 1;
        let newItems;

        if (existing) {
          updatedCount = existing.quantity + 1;
          const currentSerials = existing.scanned_serials || [];
          const updatedSerials = isUnique && serialNumber ? [...currentSerials, serialNumber] : currentSerials;
          newItems = prev.map((item) =>
            item.model_id === existing.model_id
              ? { ...item, quantity: item.quantity + 1, scanned_serials: updatedSerials }
              : item
          );
        } else {
          newItems = [
            ...prev,
            {
              model_id: model.id || `temp-${model.code}`,
              model_name: model.name,
              model_code: model.code,
              quantity: 1,
              available_stock: currentStock,
              scanned_serials: isUnique && serialNumber ? [serialNumber] : [],
            },
          ];
        }

        setLastScannedFeedback({
          text: isUnique
            ? `✓ Added: ${model.name} (#${serialNumber}) · ${updatedCount} loaded`
            : `✓ Added: ${model.name} · ${updatedCount} loaded`,
          type: updatedCount > currentStock ? 'warning' : 'success',
        });

        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        feedbackTimerRef.current = setTimeout(() => {
          setLastScannedFeedback((prev) => (prev?.type === 'success' || prev?.type === 'warning' ? null : prev));
        }, 4000);

        return newItems;
      });

      setLastScannedModel({
        model_id: model.id,
        model_code: model.code,
        model_name: model.name,
        uniqueId: uniqueId || null,
        serialNumber: serialNumber || null,
        timestamp: Date.now(),
      });
    } finally {
      // Release mutex after short debounce
      setTimeout(() => {
        isProcessingScanRef.current = false;
      }, 250);
    }
  };

  // Remove an individual box serial number from an item
  const handleRemoveSerial = (modelId, serialToRemove) => {
    setItems((prev) => {
      const target = prev.find((item) => item.model_id === modelId);
      if (!target) return prev;

      const remainingSerials = (target.scanned_serials || []).filter((s) => s !== serialToRemove);
      const newQty = target.quantity - 1;

      // Free from scannedUnitIdsRef synchronously
      const boxKey = `${target.model_code}::${serialToRemove}`;
      scannedUnitIdsRef.current.delete(boxKey);
      for (const id of scannedUnitIdsRef.current) {
        if (id.includes(serialToRemove)) scannedUnitIdsRef.current.delete(id);
      }
      setScannedUnitIds(new Set(scannedUnitIdsRef.current));

      if (newQty <= 0) {
        return prev.filter((item) => item.model_id !== modelId);
      }

      return prev.map((item) =>
        item.model_id === modelId
          ? { ...item, quantity: newQty, scanned_serials: remainingSerials }
          : item
      );
    });

    playUndoTone();
    showToast(`Removed Box #${serialToRemove}`, 'info');
  };

  // Audio helper for Undo
  const playUndoTone = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(550, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {}
  };

  // Undo Last Scan handler
  const handleUndoLastScan = () => {
    if (!lastScannedModel) return;

    // Release unique ID from duplicate tracking synchronously if undone
    if (lastScannedModel.uniqueId) {
      scannedUnitIdsRef.current.delete(lastScannedModel.uniqueId);
      setScannedUnitIds(new Set(scannedUnitIdsRef.current));
    }

    setItems((prev) => {
      const existing = prev.find(
        (item) => item.model_id === lastScannedModel.model_id || item.model_code === lastScannedModel.model_code
      );
      if (!existing) return prev;

      playUndoTone();
      const newQty = existing.quantity - 1;

      if (newQty <= 0) {
        return prev.filter((item) => item.model_id !== existing.model_id);
      }

      // Pop last serial if present
      const remainingSerials = (existing.scanned_serials || []).slice(0, -1);

      return prev.map((item) =>
        item.model_id === existing.model_id
          ? { ...item, quantity: newQty, scanned_serials: remainingSerials }
          : item
      );
    });

    setLastScannedFeedback({
      text: `Undid last scan: -1 ${lastScannedModel.model_code}${lastScannedModel.serialNumber ? ` (#${lastScannedModel.serialNumber})` : ''}`,
      type: 'warning',
    });

    showToast(`↩️ Removed 1 unit of ${lastScannedModel.model_code}`, 'info');
    setLastScannedModel(null);
  };

  // Barcode gun / manual input submit
  const handleBarcodeSubmit = (e) => {
    if (e) e.preventDefault();
    const val = barcodeInput.trim();
    if (!val) return;
    handleScan(val);
    setBarcodeInput('');
  };

  // Global keydown listener for hardware USB/Bluetooth barcode scanner guns
  useEffect(() => {
    if (currentStep !== 2) return;

    const handleKeyDown = (e) => {
      // Don't intercept if user is typing into an active input or textarea
      const targetTag = e.target?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') {
        return;
      }

      const now = Date.now();
      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length >= 3) {
          e.preventDefault();
          const scannedCode = barcodeBufferRef.current.trim();
          barcodeBufferRef.current = '';
          handleScan(scannedCode);
        }
      } else if (e.key.length === 1) {
        if (now - lastKeyTimeRef.current > 150) {
          barcodeBufferRef.current = e.key;
        } else {
          barcodeBufferRef.current += e.key;
        }
        lastKeyTimeRef.current = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, modelsCatalog]);

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
            if (nextQty <= 0) {
              if (item.scanned_serials?.length) {
                for (const s of item.scanned_serials) {
                  scannedUnitIdsRef.current.delete(`${item.model_code}::${s}`);
                }
                for (const id of Array.from(scannedUnitIdsRef.current)) {
                  if (item.scanned_serials.some((s) => id.includes(s))) {
                    scannedUnitIdsRef.current.delete(id);
                  }
                }
                setScannedUnitIds(new Set(scannedUnitIdsRef.current));
              }
              return null;
            }

            let nextSerials = item.scanned_serials || [];
            if (delta < 0 && nextSerials.length > 0) {
              const removedSerial = nextSerials[nextSerials.length - 1];
              nextSerials = nextSerials.slice(0, -1);
              scannedUnitIdsRef.current.delete(`${item.model_code}::${removedSerial}`);
              for (const id of Array.from(scannedUnitIdsRef.current)) {
                if (id.includes(removedSerial)) scannedUnitIdsRef.current.delete(id);
              }
              setScannedUnitIds(new Set(scannedUnitIdsRef.current));
            }

            return { ...item, quantity: nextQty, scanned_serials: nextSerials };
          }
          return item;
        })
        .filter(Boolean);
    });
  };

  // Set quantity directly
  const handleSetExactQuantity = (modelId, newQty) => {
    // Allow empty string so user can clear and retype
    if (newQty === '' || newQty === undefined) {
      setItems((prev) =>
        prev.map((it) => (it.model_id === modelId ? { ...it, quantity: '' } : it))
      );
      return;
    }
    const val = parseInt(newQty, 10);
    if (isNaN(val) || val < 0) return;
    setItems((prev) =>
      prev.map((item) => (item.model_id === modelId ? { ...item, quantity: val } : item))
    );
  };

  // Remove item
  const handleRemoveItem = (modelId) => {
    setItems((prev) => {
      const target = prev.find((item) => item.model_id === modelId);
      if (target?.scanned_serials?.length) {
        for (const s of target.scanned_serials) {
          scannedUnitIdsRef.current.delete(`${target.model_code}::${s}`);
        }
        for (const id of Array.from(scannedUnitIdsRef.current)) {
          if (target.scanned_serials.some((s) => id.includes(s))) {
            scannedUnitIdsRef.current.delete(id);
          }
        }
        setScannedUnitIds(new Set(scannedUnitIdsRef.current));
      }
      return prev.filter((item) => item.model_id !== modelId);
    });
  };

  // Total Items Count
  const totalQuantity = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  }, [items]);

  // Stock check: determine if any item exceeds available stock
  const stockDeficits = useMemo(() => {
    return items.filter((item) => (Number(item.quantity) || 0) > item.available_stock);
  }, [items]);

  // Validation
  const isStep1Valid = vehicleNumber.trim() && destination.trim() && dispatchDate;
  const isStep2Valid = items.length > 0 && totalQuantity > 0 && items.every((i) => (Number(i.quantity) || 0) > 0);

  // Format remarks to include verified unique box serial numbers and dispatch type tag
  const getCompiledRemarks = () => {
    const serialEntries = items
      .filter((i) => i.scanned_serials?.length > 0)
      .map((i) => `${i.model_code}: ${i.scanned_serials.map((s) => `#${s}`).join(', ')}`);

    let finalRemarks = remarks.trim();
    if (serialEntries.length > 0) {
      const serialsTag = `Verified Box Serials:\n${serialEntries.join('\n')}`;
      finalRemarks = finalRemarks ? `${finalRemarks}\n\n${serialsTag}` : serialsTag;
    }
    return formatDispatchRemarks(finalRemarks, dispatchType);
  };

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
        // Update existing dispatch via API (handles headers, items, and atomic stock adjustments for confirmed status)
        const res = await fetch(`/api/dispatch/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicle_number: vehicleNumber.trim().toUpperCase(),
            from_location: fromLocation.trim(),
            destination: destination.trim(),
            dispatch_date: dispatchDate,
            dispatch_type: dispatchType,
            remarks: getCompiledRemarks(),
            items: items.map((item) => ({
              model_id: item.model_id,
              quantity: parseInt(item.quantity, 10) || 1,
            })),
          }),
        });

        const resData = await res.json();
        if (!res.ok) {
          throw new Error(resData.error || 'Failed to update dispatch');
        }
        targetDispatchId = editId;
      } else {
        // Insert new draft dispatch
        const insertPayload = {
          vehicle_number: vehicleNumber.trim().toUpperCase(),
          from_location: fromLocation.trim(),
          destination: destination.trim(),
          dispatch_date: dispatchDate,
          dispatch_type: dispatchType,
          remarks: getCompiledRemarks(),
          status: 'draft',
          employee_id: employee.id,
        };

        let { data: newDispatch, error: insertError } = await supabase
          .from('dispatches')
          .insert(insertPayload)
          .select('id')
          .single();

        if (insertError && (insertError.message?.includes('dispatch_type') || insertError.code === 'PGRST204')) {
          delete insertPayload.dispatch_type;
          const retryRes = await supabase
            .from('dispatches')
            .insert(insertPayload)
            .select('id')
            .single();
          newDispatch = retryRes.data;
          insertError = retryRes.error;
        }

        if (insertError) throw insertError;
        targetDispatchId = newDispatch.id;

        // Insert line items
        const itemsToInsert = items.map((item) => ({
          dispatch_id: targetDispatchId,
          model_id: item.model_id,
          quantity: parseInt(item.quantity, 10) || 1,
        }));

        const { error: itemsError } = await supabase
          .from('dispatch_items')
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;
      }

      // Clear local auto-save draft upon successful server save
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(DISPATCH_DRAFT_KEY);
        }
      } catch (e) {}

      showToast(
        existingDispatchStatus === 'confirmed'
          ? 'Confirmed dispatch and inventory stock updated successfully!'
          : 'Dispatch draft saved successfully!',
        'success'
      );
      router.push('/dispatch');
    } catch (err) {
      console.error('Error saving dispatch:', err);
      showToast(err.message || 'Failed to save dispatch', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Discard draft / reset active loading session
  const handleDiscardDraft = () => {
    const totalUnits = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const msg = totalUnits > 0
      ? `Clear active dispatch for ${vehicleNumber || 'this vehicle'} (${totalUnits} units loaded)?\n\nAll scanned boxes will be cleared so you can start a fresh dispatch.`
      : 'Clear current dispatch draft?';

    if (window.confirm(msg)) {
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(DISPATCH_DRAFT_KEY);
        }
      } catch (e) {}

      setVehicleNumber('');
      setDestination('');
      setFromLocation('Jospo E41');
      setDispatchDate(todayStr);
      setRemarks('');
      setItems([]);
      scannedUnitIdsRef.current.clear();
      setScannedUnitIds(new Set());
      setLastScannedFeedback(null);
      setLastScannedModel(null);
      setCurrentStep(1);
      setDraftRestored(false);
      setDraftInfo(null);
      showToast('Loading session cleared. Ready for new vehicle.', 'info');
    }
  };

  // Confirm Dispatch (Atomic Stock Deduction)
  const handleConfirmDispatch = async () => {
    if (existingDispatchStatus === 'confirmed') {
      return handleSaveAsDraft();
    }
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
        const updatePayload = {
          vehicle_number: vehicleNumber.trim().toUpperCase(),
          from_location: fromLocation.trim(),
          destination: destination.trim(),
          dispatch_date: dispatchDate,
          dispatch_type: dispatchType,
          remarks: getCompiledRemarks(),
          updated_at: new Date().toISOString(),
        };

        let { error: updateError } = await supabase
          .from('dispatches')
          .update(updatePayload)
          .eq('id', editId);

        if (updateError && (updateError.message?.includes('dispatch_type') || updateError.code === 'PGRST204')) {
          delete updatePayload.dispatch_type;
          const retryUpdate = await supabase
            .from('dispatches')
            .update(updatePayload)
            .eq('id', editId);
          updateError = retryUpdate.error;
        }

        if (updateError) throw updateError;

        // Replace items
        await supabase.from('dispatch_items').delete().eq('dispatch_id', editId);
      } else {
        // Insert new draft dispatch record
        const insertPayload = {
          vehicle_number: vehicleNumber.trim().toUpperCase(),
          from_location: fromLocation.trim(),
          destination: destination.trim(),
          dispatch_date: dispatchDate,
          dispatch_type: dispatchType,
          remarks: getCompiledRemarks(),
          status: 'draft',
          employee_id: employee.id,
        };

        let { data: newDispatch, error: insertError } = await supabase
          .from('dispatches')
          .insert(insertPayload)
          .select('id')
          .single();

        if (insertError && (insertError.message?.includes('dispatch_type') || insertError.code === 'PGRST204')) {
          delete insertPayload.dispatch_type;
          const retryRes = await supabase
            .from('dispatches')
            .insert(insertPayload)
            .select('id')
            .single();
          newDispatch = retryRes.data;
          insertError = retryRes.error;
        }

        if (insertError) throw insertError;
        targetDispatchId = newDispatch.id;
      }

      // Insert line items
      const itemsToInsert = items.map((item) => ({
        dispatch_id: targetDispatchId,
        model_id: item.model_id,
        quantity: parseInt(item.quantity, 10) || 1,
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

      // Clear local auto-save draft upon successful confirmation
      try {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(DISPATCH_DRAFT_KEY);
        }
      } catch (e) {}

      // Success screen
      setSubmissionSuccess({
        dispatchId: targetDispatchId,
        vehicleNumber: vehicleNumber.trim().toUpperCase(),
        destination: destination.trim(),
        totalQty: totalQuantity,
        itemsCount: items.length,
        dispatchType,
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
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Dispatch Category:</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                submissionSuccess.dispatchType === 'local' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {submissionSuccess.dispatchType === 'local' ? '🏭 Local Dispatch (Other Plant)' : '🏢 Party Dispatch'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Vehicle Number:</span>
              <span className="font-mono font-bold text-gray-900">{submissionSuccess.vehicleNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">{submissionSuccess.dispatchType === 'local' ? 'Destination Plant:' : 'Destination:'}</span>
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
            <button
              type="button"
              onClick={() => setShowChallanModal(true)}
              className="btn-success text-sm py-2 px-5 inline-flex items-center justify-center space-x-1.5 font-bold shadow-md"
            >
              <span>🖨️ Print Delivery Challan</span>
            </button>
            <Link href="/dispatch" className="btn-primary text-sm py-2 px-5 text-center">
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
                setDispatchType('party');
                setCurrentStep(1);
              }}
              className="btn-secondary text-sm py-2 px-5"
            >
              Scan Another Vehicle
            </button>
          </div>

          {showChallanModal && (
            <DeliveryChallanModal
              dispatch={{
                id: submissionSuccess.dispatchId,
                dispatch_type: submissionSuccess.dispatchType,
                vehicle_number: submissionSuccess.vehicleNumber,
                destination: submissionSuccess.destination,
                dispatch_date: dispatchDate,
                from_location: fromLocation,
                employees: employee,
                dispatch_items: items.map((it) => ({
                  id: it.model_id,
                  quantity: it.quantity,
                  cooler_models: { code: it.model_code, name: it.model_name },
                })),
                remarks,
              }}
              onClose={() => setShowChallanModal(false)}
            />
          )}
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
              {editId ? (existingDispatchStatus === 'confirmed' ? 'Edit Confirmed Dispatch' : 'Edit Draft') : 'New Dispatch'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
            {editId ? (existingDispatchStatus === 'confirmed' ? 'Edit Confirmed Dispatch' : 'Edit Draft Dispatch') : 'New Cooler Dispatch'}
          </h1>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-100 text-primary-800">
          📱 Mobile Scanner
        </span>
      </div>

      {/* Confirmed Dispatch Admin Banner */}
      {existingDispatchStatus === 'confirmed' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 flex items-center space-x-3 text-xs text-indigo-950 shadow-xs">
          <span className="text-xl flex-shrink-0">✏️</span>
          <div>
            <p className="font-bold text-indigo-900">Admin Dispatch Modification Mode</p>
            <p className="text-indigo-700">
              You are editing an already confirmed dispatch. Any changes to line item quantities will automatically recalculate and adjust warehouse inventory.
            </p>
          </div>
        </div>
      )}

      {/* Active Session Restored Notification */}
      {draftRestored && draftInfo && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-sky-950 shadow-xs animate-fadeIn">
          <div className="flex items-center space-x-2.5">
            <span className="text-xl flex-shrink-0">📦</span>
            <div>
              <p className="font-bold text-sky-900">
                Resumed Active Session: Vehicle{' '}
                <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-sky-200 font-bold">
                  {draftInfo.vehicle}
                </span>{' '}
                ({draftInfo.totalQty} units loaded)
              </p>
              <p className="text-[11px] text-sky-700 mt-0.5">
                Your previously scanned boxes and vehicle details were automatically restored.
                {draftInfo.savedAt && ` (Saved at ${draftInfo.savedAt})`}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0 justify-end">
            <button
              type="button"
              onClick={() => setDraftRestored(false)}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold text-xs transition-colors shadow-sm"
            >
              Continue Loading
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-lg font-semibold text-xs transition-colors"
            >
              Discard & Start New
            </button>
          </div>
        </div>
      )}

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
            {/* Dispatch Category (Local Plant vs Party) */}
            <div className="sm:col-span-2">
              <label className="label text-xs font-bold text-gray-700">
                Dispatch Category <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => setDispatchType('party')}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-start space-x-3 ${
                    dispatchType === 'party'
                      ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${
                    dispatchType === 'party' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    🏢
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-sm text-gray-900">Party Dispatch</span>
                      {dispatchType === 'party' && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                          SELECTED
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                      Shipment to customer, dealer, or commercial buyer
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDispatchType('local')}
                  className={`p-3.5 rounded-xl border text-left transition-all flex items-start space-x-3 ${
                    dispatchType === 'local'
                      ? 'bg-purple-50/80 border-purple-500 ring-2 ring-purple-500/20 shadow-xs'
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0 ${
                    dispatchType === 'local' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    🏭
                  </div>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-sm text-gray-900">Local Dispatch</span>
                      {dispatchType === 'local' && (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                          SELECTED
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                      Internal transfer to our other manufacturing plant / unit
                    </p>
                  </div>
                </button>
              </div>
            </div>

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
                {dispatchType === 'local' ? 'Destination Plant / Receiving Unit' : 'Party / Customer Name & City'} <span className="text-red-500">*</span>
              </label>
              <input
                id="destination"
                type="text"
                required
                placeholder={dispatchType === 'local' ? 'e.g. Jospo Plant 2, Sanwer Road Unit' : 'e.g. Shree Ram Electronics, Jaipur'}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="input-field"
              />
              {dispatchType === 'local' && (
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] text-gray-400 font-medium">Quick pick:</span>
                  {['Jospo Plant 2', 'Unit 2', 'Sanwer Road Plant', 'Other Plant'].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setDestination(chip)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors"
                    >
                      + {chip}
                    </button>
                  ))}
                </div>
              )}
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
                placeholder={
                  dispatchType === 'local'
                    ? 'e.g. Inter-plant transfer memo #, receiving plant supervisor name, seal #4829'
                    : 'e.g. Driver Ramesh (Ph: 9876543210), party contact, e-way bill #, seal #4829'
                }
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
          <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-2">
              {dispatchType === 'local' ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-800 border border-purple-200">
                  🏭 Local Plant
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200">
                  🏢 Party
                </span>
              )}
              <span className="font-mono font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-primary-200">
                {vehicleNumber}
              </span>
              <span className="text-gray-500">→</span>
              <span className="font-bold text-gray-800">{destination}</span>
            </div>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="text-primary-700 hover:text-primary-900 font-semibold underline"
              >
                Edit Route
              </button>
              <button
                type="button"
                onClick={handleDiscardDraft}
                className="text-rose-600 hover:text-rose-800 font-semibold underline"
                title="Discard this loading session and start fresh"
              >
                Clear / Reset
              </button>
            </div>
          </div>

          {/* QR Scanner Component & Hardware Barcode Gun Input */}
          <div className="space-y-3">
            <QRScanner
              isActive={currentStep === 2}
              onScan={handleScan}
              suppressAudio={true}
              onError={(err) => console.warn('QR Scanner reported:', err)}
            />

            {/* Hardware Barcode Gun & Quick Manual Serial Input */}
            <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-800 flex items-center space-x-1.5">
                  <span>🔫</span>
                  <span>Barcode Gun / Quick Serial Scan</span>
                </span>
                <span className="text-[11px] text-gray-500 hidden sm:inline">
                  Supports USB / Bluetooth wireless scanners
                </span>
              </div>
              <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    🏷️
                  </span>
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Scan with barcode gun or type serial (e.g. #000001)..."
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono shadow-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!barcodeInput.trim()}
                  className="btn-primary text-xs py-2 px-4 shadow-xs whitespace-nowrap"
                >
                  Scan Box
                </button>
              </form>
            </div>
          </div>

          {/* Quick Undo Button (One-tap fix for accidental double scans) */}
          {lastScannedModel && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 flex items-center justify-between shadow-sm animate-fadeIn">
              <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                <span className="text-xl flex-shrink-0">↩️</span>
                <div className="text-xs text-amber-950 truncate">
                  <span>Scanned </span>
                  <strong className="font-mono bg-amber-200/80 px-1.5 py-0.5 rounded font-bold">
                    {lastScannedModel.model_code}
                  </strong>
                  <span className="text-amber-800 ml-1 hidden sm:inline truncate">
                    ({lastScannedModel.model_name})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleUndoLastScan}
                className="btn-danger text-xs py-1.5 px-3.5 flex-shrink-0 font-bold shadow-xs active:scale-95 inline-flex items-center space-x-1"
                title="Remove 1 unit of the last scanned cooler"
              >
                <span>Undo (-1)</span>
              </button>
            </div>
          )}

          {/* Live Feedback Banner from Last Scan */}
          {lastScannedFeedback && (
            <div
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all duration-300 shadow-xs animate-fadeIn ${
                lastScannedFeedback.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : lastScannedFeedback.type === 'duplicate' || lastScannedFeedback.type === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-900 ring-2 ring-amber-300/40'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-2 ring-emerald-300/40'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <span className="text-base flex-shrink-0">
                  {lastScannedFeedback.type === 'error'
                    ? '❌'
                    : lastScannedFeedback.type === 'duplicate' || lastScannedFeedback.type === 'warning'
                    ? '⚠️'
                    : '✅'}
                </span>
                <span>{lastScannedFeedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setLastScannedFeedback(null)}
                className="text-gray-400 hover:text-gray-600 ml-2 text-sm leading-none"
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
                  Point the camera at a BarTender QR code or use the barcode gun input above.
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
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-gray-900 tracking-tight">
                            {item.model_name}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-gray-100 text-gray-700 border border-gray-200">
                            {item.model_code}
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            {item.quantity} pcs
                          </span>
                          {item.scanned_serials?.length > 0 && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary-50 text-primary-700 border border-primary-200">
                              📦 {item.scanned_serials.length} unique boxes verified
                            </span>
                          )}
                        </div>

                        {/* Removable Box Serials Pill List */}
                        {item.scanned_serials?.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[11px] font-semibold text-gray-600">
                                📦 Verified Box Serials ({item.scanned_serials.length}):
                              </span>
                              <span className="text-[10px] text-gray-400">Click ✕ to remove box</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                              {item.scanned_serials.map((sn) => (
                                <span
                                  key={sn}
                                  className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm"
                                >
                                  <span>#{sn}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSerial(item.model_id, sn)}
                                    className="text-emerald-500 hover:text-red-600 font-bold ml-1 transition-colors"
                                    title={`Remove Box #${sn}`}
                                  >
                                    ✕
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center space-x-3 text-xs mt-1.5">
                          <span className="text-gray-500">
                            Available in Stock:{' '}
                            <strong className={hasDeficit ? 'text-red-600' : 'text-gray-800'}>
                              {item.available_stock} pcs
                            </strong>
                          </span>
                          {hasDeficit && (
                            <span className="badge-danger text-[10px]">
                              Insufficient Stock (-{item.quantity - item.available_stock} pcs)
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
                            onBlur={() => {
                              if (item.quantity === '' || parseInt(item.quantity, 10) <= 0) {
                                handleSetExactQuantity(item.model_id, '1');
                              }
                            }}
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
                <label className="label text-xs">
                  Cooler Model
                </label>
                <SearchableSelect
                  options={modelsCatalog.map((m) => ({
                    id: m.id,
                    code: m.code,
                    name: `${m.name} (Stock: ${stockMap[m.id] ?? 0})`,
                  }))}
                  value={manualModelId}
                  onChange={(val) => setManualModelId(val)}
                  placeholder="-- Select or Search Cooler Model --"
                />
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
              <span className="text-gray-500 block">Dispatch Category:</span>
              <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                dispatchType === 'local'
                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                  : 'bg-blue-100 text-blue-800 border border-blue-300'
              }`}>
                {dispatchType === 'local' ? '🏭 Local (Other Plant)' : '🏢 Party Dispatch'}
              </span>
            </div>
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
            <div className="sm:col-span-1">
              <span className="text-gray-500 block">
                {dispatchType === 'local' ? 'Destination Plant:' : 'Destination Party / City:'}
              </span>
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
                        <span className="font-bold text-gray-900 text-sm block">{item.model_name}</span>
                        <span className="font-mono text-gray-500 text-[11px]">{item.model_code}</span>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-700 font-medium">
                        {item.available_stock} pcs
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900">
                        {item.quantity} pcs
                      </td>
                      <td className="px-3 py-3 text-right font-bold">
                        <span className={deficit ? 'text-red-600' : 'text-emerald-700'}>
                          {remaining} pcs
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200 font-bold text-xs text-gray-900">
                <tr>
                  <td colSpan={2} className="px-3 py-3 text-left uppercase tracking-wider">
                    TOTAL DISPATCH QUANTITY
                  </td>
                  <td colSpan={2} className="px-3 py-3 text-right text-base font-extrabold text-primary-700">
                    {totalQuantity} pcs
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
              {existingDispatchStatus !== 'confirmed' && (
                <button
                  type="button"
                  onClick={handleSaveAsDraft}
                  disabled={submitting}
                  className="btn-secondary text-xs py-2.5 px-5 w-full sm:w-auto"
                >
                  {submitting ? 'Saving...' : 'Save as Draft'}
                </button>
              )}
              <button
                type="button"
                onClick={handleConfirmDispatch}
                disabled={submitting || (existingDispatchStatus !== 'confirmed' && stockDeficits.length > 0)}
                className="btn-success text-xs py-2.5 px-6 shadow-sm w-full sm:w-auto font-bold"
              >
                {submitting
                  ? (existingDispatchStatus === 'confirmed' ? 'Updating Stock...' : 'Confirming Dispatch...')
                  : (existingDispatchStatus === 'confirmed' ? '💾 Save Updates & Adjust Stock' : 'Confirm & Deduct Stock ✓')}
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
