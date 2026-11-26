'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AppShell from '@/components/AppShell';
import StatsCard from '@/components/StatsCard';
import DataTable from '@/components/DataTable';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { getSupabase } from '@/lib/supabase';
import { getTodayIST } from '@/lib/date';
import { exportToExcel } from '@/lib/exportExcel';
import { usePlant } from '@/contexts/PlantContext';
import dynamic from 'next/dynamic';

const PrintStockModal = dynamic(() => import('@/components/PrintStockModal'), { ssr: false });
import {
  PLANTS,
  ALL_PLANTS_ID,
  DEFAULT_PLANT_ID,
  normalizePlant,
  getPlantMeta,
} from '@/lib/plants';

export default function StockPage() {
  const { showToast } = useToast();
  const { employee, user } = useAuth();
  const supabase = getSupabase();
  const { activePlant, isOwner, userPlant } = usePlant();
  const isAdmin = employee?.role === 'admin' || isOwner;

  // Inline Stock Adjustment Modal (Admin/Owner only)
  const [adjustTargetItem, setAdjustTargetItem] = useState(null);
  const [adjustPlant, setAdjustPlant] = useState(DEFAULT_PLANT_ID);
  const [adjustType, setAdjustType] = useState('add');
  const [adjustQuantity, setAdjustQuantity] = useState(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  // Sorting & Filtering States for Current Stock (Sort by availability by default)
  const [sortBy, setSortBy] = useState('stock_desc'); // 'stock_desc' (Highest stock first) | 'stock_asc' | 'out_of_stock' | 'code_asc' | 'code_desc'
  const [stockAvailabilityFilter, setStockAvailabilityFilter] = useState('all'); // 'all' | 'in_stock' | 'low_stock' | 'out_of_stock'
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Summary and Stock State (SWR Instant Rendering)
  const [stats, setStats] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('jospo_cached_stock_stats');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
    }
    return {
      totalStock: 0,
      todayProduction: 0,
      todayDispatch: 0,
      activeModelsCount: 0,
    };
  });

  const [stockList, setStockList] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('jospo_cached_stock_list');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    return [];
  });

  const [loadingOverview, setLoadingOverview] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('jospo_cached_stock_list');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return false;
        }
      } catch (e) {}
    }
    return true;
  });

  const [stockSearchQuery, setStockSearchQuery] = useState('');

  // Stock Ledger State (with SWR instant cache)
  const [ledgerOpen, setLedgerOpen] = useState(true);
  const [ledgerEntries, setLedgerEntries] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('jospo_cached_stock_ledger');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed.entries) && parsed.entries.length > 0) return parsed.entries;
        }
      } catch (e) {}
    }
    return [];
  });
  const [loadingLedger, setLoadingLedger] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('jospo_cached_stock_ledger');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed.entries) && parsed.entries.length > 0) return false;
        }
      } catch (e) {}
    }
    return true;
  });

  // Ledger Filter States
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [totalLedgerCount, setTotalLedgerCount] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('jospo_cached_stock_ledger');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (typeof parsed.total === 'number') return parsed.total;
        }
      } catch (e) {}
    }
    return 0;
  });

  // Active models for dropdown
  const [availableModels, setAvailableModels] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('jospo_cached_stock_list');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {}
    }
    return [];
  });

  // Plant-wise stock totals for consolidated view
  const plantTotals = useMemo(() => {
    const totals = { 'E41 G2': 0, 'D4': 0, 'C116': 0 };
    stockList.forEach((item) => {
      if (item.plant_breakdown) {
        totals['E41 G2'] += item.plant_breakdown['E41 G2'] || 0;
        totals['D4'] += item.plant_breakdown['D4'] || 0;
        totals['C116'] += item.plant_breakdown['C116'] || 0;
      }
    });
    return totals;
  }, [stockList]);

  // 1. Fetch Overview & Current Stock (scoped to activePlant)
  const fetchStockOverview = useCallback(async (forceRefresh = false) => {
    try {
      const res = await fetch(`/api/stock?plant=${encodeURIComponent(activePlant)}${forceRefresh ? '&refresh=true' : ''}`);
      const apiData = await res.json();
      if (apiData.success) {
        setStockList(apiData.currentStock || []);
        setStats(apiData.stats || {});
        setAvailableModels(apiData.currentStock || []);
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('jospo_cached_stock_list', JSON.stringify(apiData.currentStock || []));
            sessionStorage.setItem('jospo_cached_stock_stats', JSON.stringify(apiData.stats || {}));
          } catch (e) {}
        }
        return;
      }
      throw new Error(apiData.error || 'Failed to fetch stock data');
    } catch (err) {
      console.error('Error fetching stock overview:', err);
      showToast('Could not load current stock data', 'error');
    } finally {
      setLoadingOverview(false);
    }
  }, [activePlant, showToast]);

  // 2. Fetch Stock Ledger (uses count: 'estimated' to avoid full-table sequential scan overhead)
  const fetchStockLedger = useCallback(async () => {
    try {
      if (ledgerEntries.length === 0) setLoadingLedger(true);

      let query = supabase
        .from('stock_ledger')
        .select('*', { count: 'estimated' })
        .order('created_at', { ascending: false });

      if (activePlant && activePlant !== ALL_PLANTS_ID) {
        query = query.eq('plant', activePlant);
      }

      if (selectedModel) {
        query = query.eq('model_code', selectedModel);
      }

      if (selectedType) {
        query = query.eq('transaction_type', selectedType);
      }

      if (startDate) {
        // Start of selected date in IST
        query = query.gte('created_at', `${startDate}T00:00:00+05:30`);
      }

      if (endDate) {
        // End of selected date in IST
        query = query.lte('created_at', `${endDate}T23:59:59.999+05:30`);
      }

      const fromIndex = (page - 1) * pageSize;
      const toIndex = fromIndex + pageSize - 1;
      query = query.range(fromIndex, toIndex);

      const { data, count, error } = await query;

      if (error) {
        // If view is missing, fallback query from stock_transactions table
        console.warn('stock_ledger view query error, attempting fallback:', error);
        let fbQuery = supabase
          .from('stock_transactions')
          .select(`
            id,
            created_at,
            transaction_type,
            quantity,
            plant,
            notes,
            reference_id,
            cooler_models (name, code),
            employees (name)
          `, { count: 'estimated' })
          .order('created_at', { ascending: false });

        if (activePlant && activePlant !== ALL_PLANTS_ID) {
          fbQuery = fbQuery.eq('plant', activePlant);
        }

        const { data: rawTx, count: rawCount } = await fbQuery.range(fromIndex, toIndex);

        if (rawTx) {
          const transformed = rawTx.map((tx) => ({
            id: tx.id,
            created_at: tx.created_at,
            model_name: tx.cooler_models?.name || 'Unknown',
            model_code: tx.cooler_models?.code || '—',
            transaction_type: tx.transaction_type,
            quantity: tx.quantity,
            plant: tx.plant || 'E41 G2',
            notes: tx.notes,
            employee_name: tx.employees?.name || 'Employee',
            reference_id: tx.reference_id,
          }));
          const exactOrEst = page === 1 && transformed.length < pageSize ? transformed.length : (rawCount || transformed.length);
          setLedgerEntries(transformed);
          setTotalLedgerCount(exactOrEst);
          return;
        }
        throw error;
      }

      const rows = data || [];
      const resolvedTotal = page === 1 && rows.length < pageSize ? rows.length : (count || rows.length);
      setLedgerEntries(rows);
      setTotalLedgerCount(resolvedTotal);
      if (typeof window !== 'undefined' && page === 1 && !selectedModel && !selectedType && !startDate && !endDate) {
        try {
          sessionStorage.setItem('jospo_cached_stock_ledger', JSON.stringify({ entries: rows, total: resolvedTotal }));
        } catch (e) {}
      }
    } catch (err) {
      console.error('Error fetching ledger:', err);
      showToast('Could not load stock transaction ledger', 'error');
    } finally {
      setLoadingLedger(false);
    }
  }, [supabase, activePlant, selectedModel, selectedType, startDate, endDate, page, showToast]);

  useEffect(() => {
    fetchStockOverview();
  }, [fetchStockOverview]);

  useEffect(() => {
    fetchStockLedger();
  }, [fetchStockLedger]);

  // Reset pagination on filter change
  const handleModelFilterChange = (val) => {
    setSelectedModel(val);
    setPage(1);
  };
  const handleTypeFilterChange = (val) => {
    setSelectedType(val);
    setPage(1);
  };
  const handleStartDateChange = (val) => {
    setStartDate(val);
    setPage(1);
  };
  const handleEndDateChange = (val) => {
    setEndDate(val);
    setPage(1);
  };
  const handleClearFilters = () => {
    setSelectedModel('');
    setSelectedType('');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  // Availability counts for filter tabs
  const availabilityCounts = useMemo(() => {
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    let negativeStock = 0;

    stockList.forEach((it) => {
      const s = Number(it.current_stock) || 0;
      if (s < 0) {
        negativeStock += 1;
        outOfStock += 1;
      } else if (s === 0) {
        outOfStock += 1;
      } else if (s < 10) {
        lowStock += 1;
        inStock += 1;
      } else {
        inStock += 1;
      }
    });

    return {
      all: stockList.length,
      inStock,
      lowStock,
      outOfStock,
      negativeStock,
    };
  }, [stockList]);

  // Filter & Sort current stock list by search, availability status, and stock availability
  const filteredStockList = useMemo(() => {
    let list = [...stockList];

    // 1. Search filter
    const q = stockSearchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (item) =>
          item.model_name?.toLowerCase().includes(q) ||
          item.model_code?.toLowerCase().includes(q)
      );
    }

    // 2. Stock Availability Filter
    if (stockAvailabilityFilter === 'in_stock') {
      list = list.filter((item) => (Number(item.current_stock) || 0) > 0);
    } else if (stockAvailabilityFilter === 'low_stock') {
      list = list.filter((item) => {
        const s = Number(item.current_stock) || 0;
        return s > 0 && s < 10;
      });
    } else if (stockAvailabilityFilter === 'out_of_stock') {
      list = list.filter((item) => (Number(item.current_stock) || 0) <= 0);
    } else if (stockAvailabilityFilter === 'negative_stock') {
      list = list.filter((item) => (Number(item.current_stock) || 0) < 0);
    }

    // 3. Sort according to stock availability or model code
    list.sort((a, b) => {
      const stockA = Number(a.current_stock) || 0;
      const stockB = Number(b.current_stock) || 0;

      if (sortBy === 'stock_desc') {
        // Highest Stock Available First (Default)
        if (stockB !== stockA) return stockB - stockA;
        return (a.model_code || '').localeCompare(b.model_code || '');
      }
      if (sortBy === 'stock_asc') {
        // Lowest Stock First
        if (stockA !== stockB) return stockA - stockB;
        return (a.model_code || '').localeCompare(b.model_code || '');
      }
      if (sortBy === 'out_of_stock') {
        // Out of Stock (0) First, then ascending
        if (stockA === 0 && stockB !== 0) return -1;
        if (stockB === 0 && stockA !== 0) return 1;
        if (stockA !== stockB) return stockA - stockB;
        return (a.model_code || '').localeCompare(b.model_code || '');
      }
      if (sortBy === 'code_asc') {
        return (a.model_code || '').localeCompare(b.model_code || '');
      }
      if (sortBy === 'code_desc') {
        return (b.model_code || '').localeCompare(a.model_code || '');
      }
      return 0;
    });

    return list;
  }, [stockList, stockSearchQuery, stockAvailabilityFilter, sortBy]);

  // Export Current Stock to Excel
  const handleExportStockSummary = () => {
    if (!filteredStockList.length) {
      showToast('No stock data available to export.', 'warning');
      return;
    }

    const rows = filteredStockList.map((item, idx) => {
      const stock = item.current_stock ?? 0;
      let status = 'In Stock';
      if (stock === 0) status = 'Out of Stock';
      else if (stock < 10) status = 'Low Stock (< 10)';

      return {
        'S.No': idx + 1,
        'Model Code': item.model_code || '',
        'Model Name': item.model_name || '',
        'Manufacturing Facility': item.manufacturing_plant || 'E41 G2',
        'Current Stock (Units)': stock,
        'Inventory Status': status,
        'Active': item.is_active ? 'Yes' : 'No',
      };
    });

    const dateStr = getTodayIST();
    exportToExcel(rows, `Jospo_Current_Stock_${dateStr}`, 'Stock Summary');
    showToast(`Exported ${rows.length} models to Excel`, 'success');
  };

  // Export Stock Ledger to Excel
  const handleExportLedger = () => {
    if (!ledgerEntries.length) {
      showToast('No ledger transactions available to export.', 'warning');
      return;
    }

    const rows = ledgerEntries.map((tx, idx) => ({
      'S.No': idx + 1,
      'Timestamp': tx.created_at ? new Date(tx.created_at).toLocaleString('en-IN') : '',
      'Model Code': tx.model_code || '',
      'Model Name': tx.model_name || '',
      'Transaction Type': (tx.transaction_type || '').toUpperCase(),
      'Quantity Change': tx.quantity > 0 ? `+${tx.quantity}` : `${tx.quantity}`,
      'Logged By': tx.employee_name || 'Staff',
      'Transaction Notes': tx.notes || '',
    }));

    const dateStr = getTodayIST();
    exportToExcel(rows, `Jospo_Stock_Ledger_${dateStr}`, 'Stock Ledger');
    showToast(`Exported ${rows.length} ledger transactions to Excel`, 'success');
  };

  // Handle open inline stock adjustment modal
  const handleOpenAdjustModal = (row) => {
    setAdjustTargetItem(row);
    const initialPlant = activePlant === ALL_PLANTS_ID ? (row.manufacturing_plant || DEFAULT_PLANT_ID) : activePlant;
    setAdjustPlant(initialPlant);
    setAdjustType('add');
    setAdjustQuantity(1);
    setAdjustReason('');
  };

  // Perform audited stock adjustment
  const handlePerformStockAdjustment = async (e) => {
    e.preventDefault();
    if (!adjustTargetItem) return;
    const qty = parseInt(adjustQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast('Please enter a valid positive quantity.', 'warning');
      return;
    }
    if (!adjustReason.trim()) {
      showToast('Audit reason is required for stock adjustments.', 'warning');
      return;
    }

    try {
      setSubmittingAdjust(true);
      const res = await fetch('/api/stock/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: adjustTargetItem.model_id,
          plant: adjustPlant,
          adjustment_type: adjustType,
          quantity: qty,
          reason: adjustReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to record stock adjustment');
      }

      // Purge local storage caches so user gets fresh view instantly
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('jospo_cached_stock_list');
        sessionStorage.removeItem('jospo_cached_stock_stats');
        sessionStorage.removeItem('jospo_cached_stock_ledger');
        sessionStorage.removeItem('jospo_dashboard_cache');
      }

      showToast(data.message || 'Stock adjustment recorded successfully', 'success');
      setAdjustTargetItem(null);
      setSubmittingAdjust(false);
      Promise.all([
        fetchStockOverview(true),
        fetchStockLedger(),
      ]);
    } catch (err) {
      console.error('Error recording stock adjustment:', err);
      showToast(err.message || 'Failed to record stock adjustment', 'error');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  // Current Stock Table Columns (Dynamic: Consolidated Matrix or Single Plant)
  const currentStockColumns = useMemo(() => {
    let cols = [];
    if (activePlant === ALL_PLANTS_ID) {
      cols = [
        {
          key: 'model_code',
          label: 'Model Code',
          render: (val) => (
            <span className="font-mono font-bold text-xs text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md border border-primary-200">
              {val}
            </span>
          ),
        },
        {
          key: 'model_name',
          label: 'Cooler Model',
          render: (val) => <span className="font-semibold text-gray-900 text-sm">{val}</span>,
        },
        {
          key: 'manufacturing_plant',
          label: 'Mfg Facility',
          render: (val) => {
            const plant = val || 'E41 G2';
            const badgeColor =
              plant === 'E41 G2'
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : plant === 'D4'
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200';
            return (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${badgeColor}`}>
                🏭 {plant}
              </span>
            );
          },
        },
        {
          key: 'e41_stock',
          label: '🏭 E41 G2',
          align: 'right',
          render: (_, row) => {
            const qty = Number(row.plant_breakdown?.['E41 G2'] ?? 0);
            return (
              <span className={`font-mono text-xs font-bold ${qty > 0 ? 'text-indigo-700' : 'text-gray-400'}`}>
                {qty.toLocaleString()} <span className="text-[10px] text-gray-400">pcs</span>
              </span>
            );
          },
        },
        {
          key: 'd4_stock',
          label: '🏭 D4 Plant',
          align: 'right',
          render: (_, row) => {
            const qty = Number(row.plant_breakdown?.['D4'] ?? 0);
            return (
              <span className={`font-mono text-xs font-bold ${qty > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                {qty.toLocaleString()} <span className="text-[10px] text-gray-400">pcs</span>
              </span>
            );
          },
        },
        {
          key: 'c116_stock',
          label: '🏭 C116 Plant',
          align: 'right',
          render: (_, row) => {
            const qty = Number(row.plant_breakdown?.['C116'] ?? 0);
            return (
              <span className={`font-mono text-xs font-bold ${qty > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                {qty.toLocaleString()} <span className="text-[10px] text-gray-400">pcs</span>
              </span>
            );
          },
        },
        {
          key: 'current_stock',
          label: 'Total Stock',
          align: 'right',
          render: (val) => {
            const qty = Number(val ?? 0);
            let colorClass = 'text-primary-700 font-extrabold';
            if (qty < 0) colorClass = 'text-purple-700 font-extrabold';
            else if (qty === 0) colorClass = 'text-rose-600 font-extrabold';
            else if (qty < 10) colorClass = 'text-amber-600 font-extrabold';
            return (
              <span className={`font-mono text-sm ${colorClass}`}>
                {qty.toLocaleString()} <span className="text-xs font-normal text-gray-500">units</span>
              </span>
            );
          },
        },
        {
          key: 'status',
          label: 'Status',
          align: 'center',
          render: (_, row) => {
            const qty = Number(row.current_stock ?? 0);
            if (qty < 0) {
              return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300" title="Dispatched before daily production log">
                  ⚡ Negative ({qty})
                </span>
              );
            }
            if (qty === 0) {
              return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                  ● Out of Stock
                </span>
              );
            }
            if (qty < 10) {
              return (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  ▲ Low (&lt;10)
                </span>
              );
            }
            return (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                ✓ Available
              </span>
            );
          },
        },
      ];
    } else {
      cols = [
        {
          key: 'model_code',
          label: 'Model Code',
          render: (val) => (
            <span className="font-mono font-bold text-xs text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md border border-primary-200">
              {val}
            </span>
          ),
        },
        {
          key: 'model_name',
          label: 'Model Name',
          render: (val) => <span className="font-semibold text-gray-900 text-sm block">{val}</span>,
        },
        {
          key: 'current_stock',
          label: `Current Stock (${activePlant})`,
          align: 'right',
          render: (val) => {
            const qty = Number(val ?? 0);
            let colorClass = 'text-emerald-700 font-extrabold';
            if (qty < 0) colorClass = 'text-purple-700 font-extrabold';
            else if (qty === 0) colorClass = 'text-rose-600 font-extrabold';
            else if (qty < 10) colorClass = 'text-amber-600 font-extrabold';
            return (
              <span className={`font-mono text-base ${colorClass}`}>
                {qty.toLocaleString()} <span className="text-xs font-normal text-gray-500">units</span>
              </span>
            );
          },
        },
        {
          key: 'status',
          label: 'Stock Status',
          align: 'center',
          render: (_, row) => {
            const qty = Number(row.current_stock ?? 0);
            if (qty < 0) {
              return (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300" title="Dispatched before daily production log">
                  ⚡ Negative ({qty})
                </span>
              );
            }
            if (qty === 0) {
              return (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                  ● Out of Stock (0)
                </span>
              );
            }
            if (qty < 10) {
              return (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  ▲ Low Stock (&lt;10)
                </span>
              );
            }
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                ✓ Good Stock ({qty})
              </span>
            );
          },
        },
      ];
    }

    if (isAdmin) {
      cols.push({
        key: 'actions',
        label: 'Action',
        align: 'center',
        render: (_, row) => (
          <button
            type="button"
            onClick={() => handleOpenAdjustModal(row)}
            className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-gray-100 hover:bg-primary-50 text-gray-700 hover:text-primary-700 border border-gray-200 transition-colors shadow-2xs"
            title="Adjust physical stock balance (Audited)"
          >
            ⚖️ Adjust
          </button>
        ),
      });
    }

    return cols;
  }, [activePlant, isAdmin]);

  // Stock Ledger Table Columns
  const ledgerColumns = [
    {
      key: 'created_at',
      label: 'Date & Time',
      render: (val) => {
        if (!val) return '—';
        const d = new Date(val);
        return (
          <div className="text-xs">
            <div className="font-semibold text-gray-900">
              {d.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </div>
            <div className="text-gray-400 font-mono text-[11px]">
              {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        );
      },
    },
    {
      key: 'model_code',
      label: 'Cooler Model',
      render: (val, row) => (
        <div>
          <div className="flex items-center space-x-1.5">
            <span className="font-mono font-bold text-xs text-primary-700 bg-primary-50 px-2 py-0.5 rounded border border-primary-100">
              {val}
            </span>
            <span className="text-xs font-medium text-gray-900 truncate max-w-[180px]">
              {row.model_name}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'transaction_type',
      label: 'Transaction Type',
      align: 'center',
      render: (val) => {
        switch (val) {
          case 'production':
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                🏭 Production
              </span>
            );
          case 'dispatch':
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                🚚 Dispatch
              </span>
            );
          case 'dispatch_reversal':
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                ↩ Reversal
              </span>
            );
          case 'adjustment':
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                ⚖ Adjustment
              </span>
            );
          default:
            return (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                {val}
              </span>
            );
        }
      },
    },
    {
      key: 'quantity',
      label: 'Quantity Change',
      align: 'right',
      render: (val) => {
        const qty = Number(val ?? 0);
        const isPositive = qty > 0;
        return (
          <span
            className={`font-mono font-bold text-sm ${
              isPositive ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {isPositive ? `+${qty.toLocaleString()}` : qty.toLocaleString()} units
          </span>
        );
      },
    },
    {
      key: 'employee_name',
      label: 'Employee',
      render: (val) => (
        <span className="text-xs font-medium text-gray-700">{val || 'System'}</span>
      ),
    },
    {
      key: 'notes',
      label: 'Notes / Remarks',
      render: (val) => (
        <span className="text-xs text-gray-500 italic max-w-xs block truncate" title={val}>
          {val || '—'}
        </span>
      ),
    },
  ];

  const totalPages = Math.ceil(totalLedgerCount / pageSize) || 1;

  return (
    <AppShell>
      <div className={`space-y-8 ${showPrintModal ? 'print:hidden' : ''}`}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="text-2xl">📊</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                Inventory & Stock Overview
              </h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                activePlant === ALL_PLANTS_ID
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
              }`}>
                {activePlant === ALL_PLANTS_ID ? '🌐 All Plants' : `🏭 ${activePlant} Plant`}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Live balances per model, daily activity summaries, and full audit ledger history.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                fetchStockOverview(true);
                fetchStockLedger();
              }}
              disabled={loadingOverview || loadingLedger}
              className="btn-secondary text-xs py-2 px-3 inline-flex items-center space-x-1.5"
            >
              <svg
                className={`w-3.5 h-3.5 ${loadingOverview || loadingLedger ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Refresh All</span>
            </button>
          </div>
        </div>

        {/* SECTION 1: Stock Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Total Stock Units"
            value={stats.totalStock}
            icon="📦"
            color="indigo"
            subtitle={activePlant === ALL_PLANTS_ID ? 'Combined across all 3 plants' : `Total stock at ${activePlant}`}
          />
          <StatsCard
            title="Today's Production"
            value={stats.todayProduction}
            icon="🏭"
            color="green"
            subtitle={activePlant === ALL_PLANTS_ID ? 'All plants manufactured today' : `${activePlant} manufactured today`}
          />
          <StatsCard
            title="Today's Dispatch"
            value={stats.todayDispatch}
            icon="🚚"
            color="yellow"
            subtitle={activePlant === ALL_PLANTS_ID ? 'All confirmed dispatches' : `${activePlant} confirmed dispatches`}
          />
          <StatsCard
            title="Active Models"
            value={stats.activeModelsCount}
            icon="❄️"
            color="blue"
            subtitle="Active cooler catalog models"
          />
        </div>

        {/* Multi-Plant Inventory Breakdown (Owner Consolidated View) */}
        {activePlant === ALL_PLANTS_ID && (
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-indigo-200/50 mb-3">
              <div className="flex items-center space-x-2">
                <span className="text-lg">🏭</span>
                <h3 className="text-sm font-bold text-gray-900">Plant-Wise Physical Stock Breakdown</h3>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                3 Facilities
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl p-3.5 border border-indigo-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-gray-500">🏭 Unit 1</span>
                  <div className="text-sm font-bold text-indigo-900">E41 G2 Plant</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-indigo-600 font-mono">
                    {plantTotals['E41 G2'].toLocaleString()}
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">coolers in stock</span>
                </div>
              </div>

              <div className="bg-white rounded-xl p-3.5 border border-emerald-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-gray-500">🏭 Unit 2</span>
                  <div className="text-sm font-bold text-emerald-900">D4 Plant</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-emerald-600 font-mono">
                    {plantTotals['D4'].toLocaleString()}
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">coolers in stock</span>
                </div>
              </div>

              <div className="bg-white rounded-xl p-3.5 border border-amber-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-gray-500">🏭 Unit 3</span>
                  <div className="text-sm font-bold text-amber-900">C116 Plant</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-extrabold text-amber-600 font-mono">
                    {plantTotals['C116'].toLocaleString()}
                  </div>
                  <span className="text-[10px] text-gray-400 font-medium">coolers in stock</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: Current Stock Table */}
        <div className="space-y-4">
          {/* Multi-Plant Inventory Matrix Banner (ONLY shown in Owner Consolidated mode) */}
          {activePlant === ALL_PLANTS_ID && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-3.5 flex items-start space-x-3 text-xs text-blue-950 shadow-xs">
              <span className="text-xl flex-shrink-0">👑</span>
              <div>
                <p className="font-bold text-blue-900">Consolidated Multi-Plant Inventory Matrix (Owner View)</p>
                <p className="text-blue-700 mt-0.5 leading-relaxed">
                  Complete enterprise overview showing manufacturing origins, individual plant balances across <strong>E41 G2</strong>, <strong>D4</strong>, and <strong>C116</strong>, and aggregate on-hand units.
                </p>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center space-x-2">
                <span>Current Stock by Model</span>
                {activePlant === ALL_PLANTS_ID ? (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                    Consolidated 3-Plant Matrix
                  </span>
                ) : (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                    {activePlant} Stock
                  </span>
                )}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {activePlant === ALL_PLANTS_ID
                  ? 'Real-time on-hand inventory levels broken down across E41 G2, D4, and C116 facilities.'
                  : `Real-time on-hand inventory levels for ${activePlant} facility.`}
              </p>
            </div>
          </div>

          {/* Controls Bar: Search, Availability Filter Chips, Sort Dropdown & Action Buttons */}
          <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              {/* Availability Filter Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setStockAvailabilityFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-bold border transition-colors flex items-center space-x-1.5 ${
                    stockAvailabilityFilter === 'all'
                      ? 'bg-gray-900 text-white border-gray-900 shadow-xs'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <span>All Models</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    stockAvailabilityFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {availabilityCounts.all}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setStockAvailabilityFilter('in_stock')}
                  className={`px-3 py-1.5 rounded-lg font-bold border transition-colors flex items-center space-x-1.5 ${
                    stockAvailabilityFilter === 'in_stock'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <span>✓ In Stock (&gt;0)</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    stockAvailabilityFilter === 'in_stock' ? 'bg-white/20 text-white' : 'bg-emerald-200 text-emerald-900'
                  }`}>
                    {availabilityCounts.inStock}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setStockAvailabilityFilter('low_stock')}
                  className={`px-3 py-1.5 rounded-lg font-bold border transition-colors flex items-center space-x-1.5 ${
                    stockAvailabilityFilter === 'low_stock'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <span>▲ Low Stock (&lt;10)</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    stockAvailabilityFilter === 'low_stock' ? 'bg-white/20 text-white' : 'bg-amber-200 text-amber-900'
                  }`}>
                    {availabilityCounts.lowStock}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setStockAvailabilityFilter('out_of_stock')}
                  className={`px-3 py-1.5 rounded-lg font-bold border transition-colors flex items-center space-x-1.5 ${
                    stockAvailabilityFilter === 'out_of_stock'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <span>● Zero Stock (0)</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    stockAvailabilityFilter === 'out_of_stock' ? 'bg-white/20 text-white' : 'bg-rose-200 text-rose-900'
                  }`}>
                    {availabilityCounts.outOfStock}
                  </span>
                </button>
              </div>

              {/* Action Buttons: Print / Save PDF & Export Excel */}
              <div className="flex items-center space-x-2 self-start lg:self-center">
                <button
                  type="button"
                  onClick={() => setShowPrintModal(true)}
                  disabled={loadingOverview || !filteredStockList.length}
                  className="btn-primary text-xs py-2 px-3.5 inline-flex items-center space-x-1.5 shadow-xs font-bold whitespace-nowrap bg-indigo-600 hover:bg-indigo-700"
                  title="Print official physical stock inventory report or save as PDF"
                >
                  <span>🖨️</span>
                  <span>Print / Save PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportStockSummary}
                  disabled={loadingOverview || !filteredStockList.length}
                  className="btn-success text-xs py-2 px-3 inline-flex items-center space-x-1 shadow-xs font-semibold whitespace-nowrap"
                  title="Download current stock balances as Excel spreadsheet"
                >
                  <span>📥</span>
                  <span>Export Excel</span>
                </button>
              </div>
            </div>

            {/* Second row: Search & Sort By Availability */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-gray-100">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Filter by cooler name or code (e.g. ICECOOL, ROLEX)..."
                  value={stockSearchQuery}
                  onChange={(e) => setStockSearchQuery(e.target.value)}
                  className="input-field text-xs pl-8 pr-3 py-1.5 bg-gray-50/60"
                />
                <svg
                  className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              {/* Sort by availability dropdown */}
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-gray-500 font-semibold whitespace-nowrap">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="input-field text-xs py-1.5 px-2.5 font-bold text-gray-800 bg-white border-gray-300 rounded-lg cursor-pointer"
                >
                  <option value="stock_desc">📈 Stock Availability: Highest First</option>
                  <option value="stock_asc">📉 Stock Availability: Lowest First</option>
                  <option value="out_of_stock">⚠️ Out of Stock (0) First</option>
                  <option value="code_asc">🔤 Model Code (A to Z)</option>
                  <option value="code_desc">🔤 Model Code (Z to A)</option>
                </select>
              </div>
            </div>
          </div>

          {loadingOverview ? (
            <div className="card py-16 flex justify-center">
              <LoadingSpinner message="Calculating real-time stock balances..." size="md" />
            </div>
          ) : (
            <DataTable
              columns={currentStockColumns}
              data={filteredStockList}
              emptyMessage={
                stockSearchQuery
                  ? `No models matching "${stockSearchQuery}"`
                  : 'No cooler models found in stock view.'
              }
            />
          )}
        </div>

        {/* SECTION 3: Stock Ledger (Transaction History - Expandable) */}
        <div className="card shadow-sm border border-gray-200 p-0 overflow-hidden">
          {/* Section Header Accordion Trigger */}
          <div
            onClick={() => setLedgerOpen(!ledgerOpen)}
            className="flex items-center justify-between p-5 bg-gray-50/70 hover:bg-gray-100/60 cursor-pointer transition-colors border-b border-gray-200"
          >
            <div className="flex items-center space-x-3">
              <span className="text-xl">📜</span>
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Stock Ledger (Transaction Audit Trail)
                </h2>
                <p className="text-xs text-gray-500">
                  Complete immutable ledger of all production, dispatch, reversal, and adjustment transactions.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-3">
              <span className="text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-full">
                {totalLedgerCount} Records
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleExportLedger();
                }}
                disabled={loadingLedger || !ledgerEntries.length}
                className="btn-success text-xs py-1 px-3 inline-flex items-center space-x-1 shadow-xs font-semibold"
                title="Download ledger audit history as Excel spreadsheet"
              >
                <span>📥</span>
                <span>Export Ledger</span>
              </button>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 p-1"
                aria-label="Toggle section"
              >
                <svg
                  className={`w-5 h-5 transform transition-transform duration-200 ${
                    ledgerOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Collapsible Content */}
          {ledgerOpen && (
            <div className="p-5 space-y-4">
              {/* Ledger Filter Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200 text-xs">
                {/* Model Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Filter by Model
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => handleModelFilterChange(e.target.value)}
                    className="input-field text-xs bg-white py-1.5"
                  >
                    <option value="">All Models</option>
                    {availableModels.map((m) => (
                      <option key={m.model_code || m.id} value={m.model_code}>
                        {m.model_code} - {m.model_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Type Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Transaction Type
                  </label>
                  <select
                    value={selectedType}
                    onChange={(e) => handleTypeFilterChange(e.target.value)}
                    className="input-field text-xs bg-white py-1.5"
                  >
                    <option value="">All Types</option>
                    <option value="production">Production (+)</option>
                    <option value="dispatch">Dispatch (-)</option>
                    <option value="dispatch_reversal">Dispatch Reversal (+)</option>
                    <option value="adjustment">Stock Adjustment (±)</option>
                  </select>
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => handleStartDateChange(e.target.value)}
                    className="input-field text-xs bg-white py-1.5"
                  />
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => handleEndDateChange(e.target.value)}
                    className="input-field text-xs bg-white py-1.5"
                  />
                </div>

                {/* Clear Filters */}
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="btn-secondary w-full text-xs py-2 inline-flex items-center justify-center space-x-1"
                  >
                    <span>Clear Filters</span>
                  </button>
                </div>
              </div>

              {/* Ledger Table */}
              {loadingLedger ? (
                <div className="py-12 flex justify-center">
                  <LoadingSpinner message="Querying ledger records..." size="sm" />
                </div>
              ) : (
                <DataTable
                  columns={ledgerColumns}
                  data={ledgerEntries}
                  emptyMessage="No stock transactions found matching the selected filters."
                />
              )}

              {/* Pagination Controls */}
              {totalLedgerCount > pageSize && (
                <div className="flex items-center justify-between border-t border-gray-100 pt-4 text-xs text-gray-600">
                  <div>
                    Showing {(page - 1) * pageSize + 1} to{' '}
                    {Math.min(page * pageSize, totalLedgerCount)} of {totalLedgerCount} records
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1 || loadingLedger}
                      className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="font-semibold text-gray-800">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages || loadingLedger}
                      className="btn-secondary text-xs py-1 px-3 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Printable Physical Stock Inventory Modal */}
      {showPrintModal && (
        <PrintStockModal
          stockList={stockList}
          initialSearch={stockSearchQuery}
          activePlant={activePlant}
          stats={stats}
          plantTotals={plantTotals}
          userName={employee?.name || user?.email?.split('@')[0] || 'Staff'}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* Inline Audited Stock Adjustment Modal (Admin/Owner) */}
      {adjustTargetItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <span>⚖️</span>
                  <span>Adjust Stock Balance</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Audited inventory adjustment for physical discrepancies.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustTargetItem(null)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1 rounded-md"
              >
                ✕
              </button>
            </div>

            {/* Target Model Info Card */}
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-xs text-primary-700 bg-primary-100 px-2 py-0.5 rounded">
                    {adjustTargetItem.model_code}
                  </span>
                  <div className="font-semibold text-gray-900 text-sm mt-1">
                    {adjustTargetItem.model_name}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-gray-500">All Plants Total</div>
                  <div className="text-sm font-extrabold text-gray-800 font-mono">
                    {(adjustTargetItem.plant_breakdown?.total ?? adjustTargetItem.current_stock ?? 0).toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span>
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={handlePerformStockAdjustment} className="space-y-3.5">
              {/* Plant Selection */}
              <div>
                <label className="label text-xs font-semibold text-gray-700">
                  Target Plant <span className="text-red-500">*</span>
                </label>
                <select
                  value={adjustPlant}
                  onChange={(e) => setAdjustPlant(e.target.value)}
                  className="input-field text-sm py-2"
                >
                  {PLANTS.map((p) => (
                    <option key={p.id} value={p.id}>
                      🏭 {p.id} — {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Adjustment Type Toggle */}
              <div>
                <label className="label text-xs font-semibold text-gray-700">
                  Adjustment Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustType('add')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center space-x-1.5 ${
                      adjustType === 'add'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-400 ring-2 ring-emerald-200'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span>➕ Add Stock (+)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('deduct')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center space-x-1.5 ${
                      adjustType === 'deduct'
                        ? 'bg-rose-50 text-rose-700 border-rose-400 ring-2 ring-rose-200'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span>➖ Deduct Stock (-)</span>
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="label text-xs font-semibold text-gray-700">
                  Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(e.target.value)}
                  className="input-field font-mono font-bold text-sm py-2"
                  placeholder="Enter quantity"
                  required
                />
              </div>

              {/* Reason */}
              <div>
                <label className="label text-xs font-semibold text-gray-700">
                  Audit Reason <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Physical inventory recount discrepancy"
                  className="input-field text-sm py-2"
                  required
                />
              </div>

              {/* Stock Preview */}
              {(() => {
                const cur = adjustTargetItem.plant_breakdown?.[adjustPlant] !== undefined
                  ? (adjustTargetItem.plant_breakdown[adjustPlant] || 0)
                  : (adjustPlant === activePlant ? (adjustTargetItem.current_stock || 0) : 0);
                const q = parseInt(adjustQuantity, 10) || 0;
                const proj = adjustType === 'add' ? cur + q : cur - q;
                return (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Current Stock at {adjustPlant}:</span>
                      <span className="font-bold font-mono text-gray-900">{cur.toLocaleString()} units</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Projected Balance:</span>
                      <span className={`font-extrabold font-mono ${proj < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {proj.toLocaleString()} units
                      </span>
                    </div>
                    {adjustType === 'deduct' && q > cur && (
                      <p className="text-rose-600 font-medium text-[11px] pt-1">
                        ⚠️ Warning: Deducting more than current stock ({cur} units) will result in negative stock.
                      </p>
                    )}
                  </div>
                );
              })()}

              {/* Modal Actions */}
              <div className="flex items-center justify-end space-x-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setAdjustTargetItem(null)}
                  disabled={submittingAdjust}
                  className="btn-secondary text-xs py-2 px-3.5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjust || !adjustReason.trim() || Number(adjustQuantity) <= 0}
                  className={`text-xs py-2 px-4 rounded-lg font-bold text-white shadow-sm flex items-center space-x-1.5 transition-all ${
                    adjustType === 'add'
                      ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300'
                      : 'bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300'
                  }`}
                >
                  {submittingAdjust ? (
                    <span>Adjusting...</span>
                  ) : (
                    <span>{adjustType === 'add' ? '➕ Confirm Addition' : '➖ Confirm Deduction'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
