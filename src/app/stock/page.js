'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AppShell from '@/components/AppShell';
import StatsCard from '@/components/StatsCard';
import DataTable from '@/components/DataTable';
import LoadingSpinner from '@/components/LoadingSpinner';
import { useToast } from '@/components/Toast';
import { getSupabase } from '@/lib/supabase';

export default function StockPage() {
  const { showToast } = useToast();
  const supabase = getSupabase();

  // Summary and Stock State
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [stats, setStats] = useState({
    totalStock: 0,
    todayProduction: 0,
    todayDispatch: 0,
    activeModelsCount: 0,
  });
  const [stockList, setStockList] = useState([]);
  const [stockSearchQuery, setStockSearchQuery] = useState('');

  // Stock Ledger State
  const [ledgerOpen, setLedgerOpen] = useState(true);
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [loadingLedger, setLoadingLedger] = useState(true);

  // Ledger Filter States
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [totalLedgerCount, setTotalLedgerCount] = useState(0);

  // Active models for dropdown
  const [availableModels, setAvailableModels] = useState([]);

  // 1. Fetch Overview & Current Stock
  const fetchStockOverview = useCallback(async () => {
    try {
      setLoadingOverview(true);

      // Query current_stock view directly via Supabase client
      const { data: stockData, error: stockErr } = await supabase
        .from('current_stock')
        .select('*')
        .order('model_code', { ascending: true });

      if (stockErr) {
        // Fallback to API route if view query has RLS/permission issues
        const res = await fetch('/api/stock');
        const apiData = await res.json();
        if (apiData.success) {
          setStockList(apiData.currentStock || []);
          setStats(apiData.stats || {});
          setAvailableModels(apiData.currentStock || []);
          return;
        }
        throw stockErr;
      }

      const formattedStock = (stockData || []).map((row) => ({
        ...row,
        current_stock: Number(row.current_stock ?? 0),
      }));

      setStockList(formattedStock);
      setAvailableModels(formattedStock);

      // Also compute stats from DB
      const todayStr = new Date().toISOString().split('T')[0];

      // Total Stock
      const totalUnits = formattedStock.reduce(
        (sum, item) => sum + (item.current_stock || 0),
        0
      );

      // Today's Production
      const { data: prodData } = await supabase
        .from('production_entries')
        .select('quantity')
        .eq('production_date', todayStr);
      const prodSum = (prodData || []).reduce(
        (acc, r) => acc + (r.quantity || 0),
        0
      );

      // Today's Dispatch
      const { data: dispData } = await supabase
        .from('dispatches')
        .select('id, dispatch_items(quantity)')
        .eq('dispatch_date', todayStr)
        .eq('status', 'confirmed');
      let dispSum = 0;
      if (dispData) {
        for (const d of dispData) {
          for (const item of d.dispatch_items || []) {
            dispSum += item.quantity || 0;
          }
        }
      }

      setStats({
        totalStock: totalUnits,
        todayProduction: prodSum,
        todayDispatch: dispSum,
        activeModelsCount: formattedStock.length,
      });
    } catch (err) {
      console.error('Error fetching stock overview:', err);
      showToast('Could not load current stock data', 'error');
    } finally {
      setLoadingOverview(false);
    }
  }, [supabase, showToast]);

  // 2. Fetch Stock Ledger
  const fetchStockLedger = useCallback(async () => {
    try {
      setLoadingLedger(true);

      let query = supabase
        .from('stock_ledger')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (selectedModel) {
        query = query.eq('model_code', selectedModel);
      }

      if (selectedType) {
        query = query.eq('transaction_type', selectedType);
      }

      if (startDate) {
        // Start of selected date in ISO
        query = query.gte('created_at', `${startDate}T00:00:00.000Z`);
      }

      if (endDate) {
        // End of selected date in ISO
        query = query.lte('created_at', `${endDate}T23:59:59.999Z`);
      }

      const fromIndex = (page - 1) * pageSize;
      const toIndex = fromIndex + pageSize - 1;
      query = query.range(fromIndex, toIndex);

      const { data, count, error } = await query;

      if (error) {
        // If view is missing, fallback query from stock_transactions table
        console.warn('stock_ledger view query error, attempting fallback:', error);
        const { data: rawTx, count: rawCount } = await supabase
          .from('stock_transactions')
          .select(`
            id,
            created_at,
            transaction_type,
            quantity,
            notes,
            reference_id,
            cooler_models (name, code),
            employees (name)
          `, { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(fromIndex, toIndex);

        if (rawTx) {
          const transformed = rawTx.map((tx) => ({
            id: tx.id,
            created_at: tx.created_at,
            model_name: tx.cooler_models?.name || 'Unknown',
            model_code: tx.cooler_models?.code || '—',
            transaction_type: tx.transaction_type,
            quantity: tx.quantity,
            notes: tx.notes,
            employee_name: tx.employees?.name || 'Employee',
            reference_id: tx.reference_id,
          }));
          setLedgerEntries(transformed);
          setTotalLedgerCount(rawCount || transformed.length);
          return;
        }
        throw error;
      }

      setLedgerEntries(data || []);
      setTotalLedgerCount(count || (data ? data.length : 0));
    } catch (err) {
      console.error('Error fetching ledger:', err);
      showToast('Could not load stock transaction ledger', 'error');
    } finally {
      setLoadingLedger(false);
    }
  }, [supabase, selectedModel, selectedType, startDate, endDate, page, showToast]);

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

  // Filter current stock table by search
  const filteredStockList = useMemo(() => {
    const q = stockSearchQuery.toLowerCase().trim();
    if (!q) return stockList;
    return stockList.filter(
      (item) =>
        item.model_name?.toLowerCase().includes(q) ||
        item.model_code?.toLowerCase().includes(q)
    );
  }, [stockList, stockSearchQuery]);

  // Current Stock Table Columns
  const currentStockColumns = [
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
      render: (val) => (
        <span className="font-semibold text-gray-900 text-sm">{val}</span>
      ),
    },
    {
      key: 'current_stock',
      label: 'Current Stock',
      align: 'right',
      render: (val) => {
        const qty = Number(val ?? 0);
        let colorClass = 'text-emerald-700 font-extrabold';
        if (qty === 0) {
          colorClass = 'text-rose-600 font-extrabold';
        } else if (qty < 10) {
          colorClass = 'text-amber-600 font-extrabold';
        }
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
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-2xl">📊</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                Inventory & Stock Overview
              </h1>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Live balances per model, daily activity summaries, and full audit ledger history.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => {
                fetchStockOverview();
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
            subtitle="Combined across all models"
          />
          <StatsCard
            title="Today's Production"
            value={stats.todayProduction}
            icon="🏭"
            color="green"
            subtitle="Units manufactured today"
          />
          <StatsCard
            title="Today's Dispatch"
            value={stats.todayDispatch}
            icon="🚚"
            color="yellow"
            subtitle="Units dispatched & confirmed"
          />
          <StatsCard
            title="Active Models"
            value={stats.activeModelsCount}
            icon="❄️"
            color="blue"
            subtitle="Active cooler catalog models"
          />
        </div>

        {/* SECTION 2: Current Stock Table */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Current Stock by Model</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Real-time on-hand inventory levels calculated from stock transactions.
              </p>
            </div>

            {/* Search Box */}
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                placeholder="Filter by code or name..."
                value={stockSearchQuery}
                onChange={(e) => setStockSearchQuery(e.target.value)}
                className="input-field text-xs pl-8 pr-3 py-2"
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

            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-full">
                {totalLedgerCount} Records
              </span>
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
    </AppShell>
  );
}
