'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import DataTable from '@/components/DataTable';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getSupabase } from '@/lib/supabase';

export default function ProductionPage() {
  const { employee } = useAuth();
  const { showToast } = useToast();
  const supabase = getSupabase();

  const getTodayStr = () => new Date().toISOString().split('T')[0];

  // Form State
  const [productionDate, setProductionDate] = useState(getTodayStr());
  const [remarks, setRemarks] = useState('');
  const [rows, setRows] = useState([
    { id: 'item-1', model_id: '', quantity: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Active Models Dropdown Data
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(true);

  // Today's Production Log State
  const [logEntries, setLogEntries] = useState([]);
  const [loadingLog, setLoadingLog] = useState(true);

  // Fetch active cooler models for the dropdown
  const fetchModels = useCallback(async () => {
    try {
      setLoadingModels(true);
      const { data, error } = await supabase
        .from('cooler_models')
        .select('id, name, code, is_active')
        .eq('is_active', true)
        .order('code', { ascending: true });

      if (error) throw error;
      setModels(data || []);
    } catch (err) {
      console.error('Error fetching models:', err);
      showToast('Could not load cooler models list', 'error');
    } finally {
      setLoadingModels(false);
    }
  }, [supabase, showToast]);

  // Fetch production log for the selected/today date
  const fetchTodayLog = useCallback(async (targetDate = productionDate) => {
    try {
      setLoadingLog(true);
      const queryDate = targetDate || getTodayStr();
      const res = await fetch(`/api/production?date=${encodeURIComponent(queryDate)}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch production entries');
      }

      setLogEntries(data.entries || []);
    } catch (err) {
      console.error('Error fetching production log:', err);
      showToast('Could not refresh production log', 'error');
    } finally {
      setLoadingLog(false);
    }
  }, [productionDate, showToast]);

  useEffect(() => {
    fetchModels();
    fetchTodayLog(productionDate);
  }, [fetchModels, fetchTodayLog, productionDate]);

  // Row management
  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      { id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`, model_id: '', quantity: '' },
    ]);
  };

  const handleRemoveRow = (idToRemove) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.id !== idToRemove));
  };

  const handleRowChange = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  // Calculate total quantity across all valid rows
  const totalQuantity = useMemo(() => {
    return rows.reduce((sum, r) => {
      const q = parseInt(r.quantity, 10);
      return sum + (!isNaN(q) && q > 0 ? q : 0);
    }, 0);
  }, [rows]);

  // Form submission
  const handleSubmitProduction = async (e) => {
    e.preventDefault();

    // Validation
    if (!productionDate) {
      showToast('Please select a production date.', 'warning');
      return;
    }

    const validEntries = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.model_id) {
        showToast(`Please choose a model for Row #${i + 1}`, 'warning');
        return;
      }
      const qty = parseInt(row.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        showToast(`Quantity for Row #${i + 1} must be a number greater than 0`, 'warning');
        return;
      }
      validEntries.push({
        model_id: row.model_id,
        quantity: qty,
      });
    }

    if (validEntries.length === 0) {
      showToast('Please add at least one model entry.', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: validEntries,
          production_date: productionDate,
          remarks: remarks.trim() || null,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit production entries');
      }

      showToast(
        `Successfully logged ${totalQuantity} units across ${validEntries.length} model(s)!`,
        'success'
      );

      // Reset form
      setRows([{ id: `item-${Date.now()}`, model_id: '', quantity: '' }]);
      setRemarks('');

      // Refresh production log
      await fetchTodayLog(productionDate);
    } catch (err) {
      console.error('Production submission error:', err);
      showToast(err.message || 'Error recording production', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Format log timestamp
  const formatTime = (isoString) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  // Table columns for production log
  const logColumns = [
    {
      key: 'created_at',
      label: 'Time',
      render: (val) => (
        <span className="font-mono text-xs text-gray-500 font-medium">
          {formatTime(val)}
        </span>
      ),
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
            <span className="text-xs font-semibold text-gray-900">{row.model_name}</span>
          </div>
          {row.remarks && (
            <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-xs italic">
              Note: {row.remarks}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'quantity',
      label: 'Quantity',
      align: 'right',
      render: (val) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
          +{Number(val).toLocaleString()} units
        </span>
      ),
    },
    {
      key: 'employee_name',
      label: 'Logged By',
      render: (val) => (
        <div className="flex items-center space-x-1.5 text-xs text-gray-600">
          <div className="w-5 h-5 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-[10px] font-bold uppercase">
            {(val || 'U')[0]}
          </div>
          <span className="font-medium">{val || 'Employee'}</span>
        </div>
      ),
    },
  ];

  // Calculate sum of log
  const logTotalUnits = useMemo(() => {
    return logEntries.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [logEntries]);

  return (
    <AppShell allowedRoles={['admin', 'production']}>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-2xl">🏭</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                Production Entry
              </h1>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Record manufactured cooler units to automatically increment real-time stock balances.
            </p>
          </div>

          <div className="flex items-center space-x-3 text-sm">
            <div className="bg-white px-3.5 py-2 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-2">
              <span className="text-gray-400">📅</span>
              <span className="font-semibold text-gray-800">
                {new Date(productionDate + 'T00:00:00').toLocaleDateString(undefined, {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Two Sections: Left = Production Form, Right = Today's Log */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT SECTION: Production Form (5 cols on lg) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="card shadow-sm border border-gray-200">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <span>Batch Production Form</span>
                </h2>
                <span className="text-xs bg-primary-50 text-primary-700 font-medium px-2 py-0.5 rounded-full border border-primary-200">
                  {rows.length} {rows.length === 1 ? 'Model' : 'Models'}
                </span>
              </div>

              <form onSubmit={handleSubmitProduction} className="space-y-5">
                {/* Date Picker */}
                <div>
                  <label className="label">
                    Production Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={productionDate}
                    max={getTodayStr()}
                    onChange={(e) => setProductionDate(e.target.value)}
                    className="input-field text-sm font-medium"
                    required
                  />
                  <span className="text-[11px] text-gray-400 mt-1 block">
                    Defaults to today. Can be adjusted for prior shift logging.
                  </span>
                </div>

                {/* Dynamic Model Rows */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="label mb-0">
                      Models & Quantities <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-gray-400">
                      Units manufactured
                    </span>
                  </div>

                  {rows.map((row, index) => (
                    <div
                      key={row.id}
                      className="flex items-center gap-2 p-3 bg-gray-50/70 rounded-xl border border-gray-200"
                    >
                      {/* Model Dropdown */}
                      <div className="flex-1 min-w-0">
                        <select
                          value={row.model_id}
                          onChange={(e) =>
                            handleRowChange(row.id, 'model_id', e.target.value)
                          }
                          disabled={loadingModels}
                          className="input-field text-xs bg-white"
                          required
                        >
                          <option value="">
                            {loadingModels ? 'Loading models...' : '-- Select Model --'}
                          </option>
                          {models.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.code} - {m.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity input */}
                      <div className="w-24 flex-shrink-0">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Qty"
                          value={row.quantity}
                          onChange={(e) =>
                            handleRowChange(row.id, 'quantity', e.target.value)
                          }
                          className="input-field text-xs text-center font-bold font-mono bg-white"
                          required
                        />
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        disabled={rows.length <= 1}
                        className={`p-2 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ${
                          rows.length <= 1 ? 'opacity-30 cursor-not-allowed' : ''
                        }`}
                        title="Remove this row"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {/* Add Another Model Button */}
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="w-full py-2 px-3 border border-dashed border-gray-300 rounded-xl text-xs font-semibold text-primary-600 hover:bg-primary-50/50 hover:border-primary-300 transition-colors flex items-center justify-center space-x-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Add Another Model</span>
                  </button>
                </div>

                {/* Optional Remarks */}
                <div>
                  <label className="label">Remarks / Shift Notes (Optional)</label>
                  <textarea
                    rows={2}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Shift 1 production, quality inspected by Supervisor"
                    className="input-field text-xs"
                  />
                </div>

                {/* Total Quantity Card */}
                <div className="bg-gradient-to-r from-primary-50 to-indigo-50/40 p-4 rounded-xl border border-primary-100 flex items-center justify-between">
                  <div>
                    <span className="text-xs uppercase font-bold tracking-wider text-primary-700">
                      Total Production
                    </span>
                    <p className="text-[11px] text-gray-500">
                      Cumulative units to be added into stock
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-extrabold text-primary-700 font-mono">
                      {totalQuantity.toLocaleString()}
                    </span>
                    <span className="text-xs font-medium text-gray-500 ml-1">units</span>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={submitting || totalQuantity <= 0}
                  className="btn-primary w-full py-3 inline-flex items-center justify-center space-x-2 text-sm shadow-md"
                >
                  {submitting ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      <span>Recording Production...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>Submit Production Entry</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* RIGHT SECTION: Today's Production Log (7 cols on lg) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                  <span>Production Log</span>
                  <span className="text-xs font-normal text-gray-500">
                    ({productionDate === getTodayStr() ? "Today's Entries" : productionDate})
                  </span>
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Real-time log of manufactured models recorded for this date.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {logTotalUnits.toLocaleString()} units produced
                </span>

                <button
                  type="button"
                  onClick={() => fetchTodayLog(productionDate)}
                  disabled={loadingLog}
                  className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center space-x-1"
                  title="Refresh Log"
                >
                  <svg
                    className={`w-3.5 h-3.5 ${loadingLog ? 'animate-spin' : ''}`}
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
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Log Table */}
            {loadingLog ? (
              <div className="card py-16 flex justify-center">
                <LoadingSpinner message="Fetching daily production log..." size="md" />
              </div>
            ) : (
              <DataTable
                columns={logColumns}
                data={logEntries}
                emptyMessage={`No production entries recorded for ${productionDate} yet. Use the form on the left to submit.`}
              />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
