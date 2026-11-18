'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
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
  const [manpower, setManpower] = useState('');
  const [rows, setRows] = useState([
    { id: 'item-1', model_id: '', quantity: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = employee?.role === 'admin';

  // Thekedar (Assembly Contractor) State
  const [thekedars, setThekedars] = useState([
    'Chotu',
    'Ramesh Thekedar',
    'Suresh Thekedar',
    'Mukesh Thekedar',
    'Kailash Assembly',
  ]);
  const [selectedThekedar, setSelectedThekedar] = useState('');
  const [showManageThekedarsModal, setShowManageThekedarsModal] = useState(false);
  const [newThekedarName, setNewThekedarName] = useState('');
  const [savingThekedar, setSavingThekedar] = useState(false);
  const [logThekedarFilter, setLogThekedarFilter] = useState('all');

  // Edit & Delete Production Entry Modal State
  const [editingEntry, setEditingEntry] = useState(null);
  const [editModelId, setEditModelId] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editThekedar, setEditThekedar] = useState('');
  const [editManpower, setEditManpower] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingEntry, setDeletingEntry] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Helper to determine if an entry was created / logged today
  const isEntryFromToday = useCallback((row) => {
    if (!row) return false;
    const now = new Date();
    const utcToday = now.toISOString().split('T')[0];
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (row.production_date === utcToday || row.production_date === localToday) return true;
    if (row.created_at) {
      const created = new Date(row.created_at);
      const createdLocal = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
      if (createdLocal === localToday) return true;
      const diffHours = (now.getTime() - created.getTime()) / (1000 * 60 * 60);
      if (diffHours >= 0 && diffHours <= 24) return true;
    }
    return false;
  }, []);

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

  // Fetch contractor list from /api/contractors
  const fetchThekedars = useCallback(async () => {
    try {
      const res = await fetch('/api/contractors');
      const data = await res.json();
      if (res.ok && data.contractors && Array.isArray(data.contractors) && data.contractors.length > 0) {
        setThekedars(data.contractors);
        setSelectedThekedar((curr) => (curr && data.contractors.includes(curr) ? curr : data.contractors[0]));
      }
    } catch (e) {
      console.warn('Could not fetch contractors:', e);
    }
  }, []);

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

      if (data.contractors && Array.isArray(data.contractors) && data.contractors.length > 0) {
        setThekedars((prev) => Array.from(new Set([...prev, ...data.contractors])).filter(Boolean));
      }
    } catch (err) {
      console.error('Error fetching production log:', err);
      showToast('Could not refresh production log', 'error');
    } finally {
      setLoadingLog(false);
    }
  }, [productionDate, showToast]);

  useEffect(() => {
    fetchModels();
    fetchThekedars();
    fetchTodayLog(productionDate);
  }, [fetchModels, fetchThekedars, fetchTodayLog, productionDate]);

  // Admin-only helper: Add new Thekedar
  const handleAddNewThekedar = async (e) => {
    if (e) e.preventDefault();
    if (!isAdmin) {
      showToast('Permission denied. Only Admins can add Thekedars.', 'error');
      return;
    }
    const clean = newThekedarName.trim();
    if (!clean) {
      showToast('Please enter a contractor / Thekedar name', 'warning');
      return;
    }
    try {
      setSavingThekedar(true);
      const res = await fetch('/api/contractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add Thekedar');

      const updated = Array.from(new Set([...thekedars, clean]));
      setThekedars(updated);
      setSelectedThekedar(clean);
      setNewThekedarName('');
      showToast(`Added Thekedar: ${clean}`, 'success');
    } catch (err) {
      console.error('Error adding Thekedar:', err);
      showToast(err.message || 'Error adding Thekedar', 'error');
    } finally {
      setSavingThekedar(false);
    }
  };

  // Admin-only helper: Remove Thekedar
  const handleRemoveThekedar = async (nameToRemove) => {
    if (!isAdmin) {
      showToast('Permission denied. Only Admins can remove Thekedars.', 'error');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove "${nameToRemove}" from active Thekedars?`)) {
      return;
    }
    try {
      setSavingThekedar(true);
      const res = await fetch(`/api/contractors?name=${encodeURIComponent(nameToRemove)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove Thekedar');

      const updated = thekedars.filter((t) => t !== nameToRemove);
      setThekedars(updated);
      if (selectedThekedar === nameToRemove) {
        setSelectedThekedar(updated[0] || '');
      }
      showToast(`Removed Thekedar: ${nameToRemove}`, 'success');
    } catch (err) {
      console.error('Error removing Thekedar:', err);
      showToast(err.message || 'Error removing Thekedar', 'error');
    } finally {
      setSavingThekedar(false);
    }
  };

  // Open Edit Modal for a row
  const handleOpenEditModal = (row) => {
    setEditingEntry(row);
    setEditModelId(row.model_id || '');
    setEditQuantity(row.quantity || '');
    setEditThekedar(row.contractor_name || row.thekedar_name || (thekedars[0] || ''));
    setEditManpower(row.manpower || '');
    setEditRemarks(row.display_remarks || row.remarks || '');
  };

  // Submit Edit changes
  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editingEntry) return;

    const qty = parseInt(editQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast('Quantity must be a positive number greater than 0', 'warning');
      return;
    }
    if (!editModelId) {
      showToast('Please select a cooler model', 'warning');
      return;
    }

    try {
      setSavingEdit(true);
      const res = await fetch('/api/production', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingEntry.id,
          model_id: editModelId,
          quantity: qty,
          contractor_name: (editThekedar || '').trim(),
          manpower: editManpower !== '' && !isNaN(Number(editManpower)) ? parseInt(editManpower, 10) : null,
          remarks: (editRemarks || '').trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update entry');
      }

      showToast(data.message || 'Production entry updated successfully', 'success');
      setEditingEntry(null);
      await fetchTodayLog(productionDate);
    } catch (err) {
      console.error('Error saving production edit:', err);
      showToast(err.message || 'Failed to update entry', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Confirm and execute entry deletion
  const handleConfirmDelete = async () => {
    if (!deletingEntry) return;

    try {
      setDeleting(true);
      const res = await fetch(`/api/production?id=${encodeURIComponent(deletingEntry.id)}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete entry');
      }

      showToast(data.message || 'Production entry deleted successfully', 'success');
      setDeletingEntry(null);
      await fetchTodayLog(productionDate);
    } catch (err) {
      console.error('Error deleting production entry:', err);
      showToast(err.message || 'Failed to delete entry', 'error');
    } finally {
      setDeleting(false);
    }
  };

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

    const finalThekedar = (selectedThekedar || '').trim();
    if (!finalThekedar) {
      showToast('Please select or add the Thekedar (Contractor) who assembled these units.', 'warning');
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
          contractor_name: finalThekedar,
          thekedar_name: finalThekedar,
          manpower: manpower !== '' && !isNaN(Number(manpower)) ? parseInt(manpower, 10) : null,
          remarks: remarks.trim() || null,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit production entries');
      }

      // Persist thekedar to list and localStorage if newly typed
      if (finalThekedar && !thekedars.includes(finalThekedar)) {
        const updated = Array.from(new Set([...thekedars, finalThekedar]));
        setThekedars(updated);
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('jospo_thekedars_list', JSON.stringify(updated));
          }
        } catch (e) {}
      }

      showToast(
        `Successfully logged ${totalQuantity} units under "${finalThekedar}" across ${validEntries.length} model(s)!`,
        'success'
      );

      // Reset form rows & remarks & manpower (keep selected Thekedar for rapid consecutive batch logging)
      setRows([{ id: `item-${Date.now()}`, model_id: '', quantity: '' }]);
      setRemarks('');
      setManpower('');

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

  // Filtered log entries based on selected contractor filter
  const displayedLogEntries = useMemo(() => {
    if (!logThekedarFilter || logThekedarFilter === 'all') return logEntries;
    return logEntries.filter(
      (item) => (item.contractor_name || 'General / Unassigned').toLowerCase() === logThekedarFilter.toLowerCase()
    );
  }, [logEntries, logThekedarFilter]);

  // Calculate sum of log
  const logTotalUnits = useMemo(() => {
    return displayedLogEntries.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }, [displayedLogEntries]);

  // Group log entries by Thekedar as Category
  const groupedByThekedar = useMemo(() => {
    const groups = {};
    for (const entry of displayedLogEntries) {
      const thekedar = entry.contractor_name || 'General Assembly';
      if (!groups[thekedar]) {
        groups[thekedar] = {
          thekedar,
          entries: [],
          totalUnits: 0,
          manpower: entry.manpower || null,
        };
      }
      groups[thekedar].entries.push(entry);
      groups[thekedar].totalUnits += entry.quantity || 0;
      if (!groups[thekedar].manpower && entry.manpower) {
        groups[thekedar].manpower = entry.manpower;
      }
    }
    return Object.values(groups);
  }, [displayedLogEntries]);

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
              Record manufactured cooler units under Thekedars to automatically increment real-time stock balances.
            </p>
          </div>

          <div className="flex items-center space-x-3 text-sm">
            <Link
              href="/reports?tab=thekedar_production"
              className="bg-white hover:bg-gray-50 text-gray-700 font-semibold px-3 py-2 rounded-xl border border-gray-200 shadow-sm flex items-center space-x-1.5 transition-colors text-xs"
            >
              <span>👷</span>
              <span>Thekedar Reports & Settlements</span>
              <span className="text-gray-400">→</span>
            </Link>

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

                {/* Thekedar / Assembly Contractor Section */}
                <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200/90 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-amber-950 flex items-center space-x-1.5">
                      <span>👷 Thekedar (Assembly Contractor)</span>
                      <span className="text-red-500">*</span>
                    </label>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setShowManageThekedarsModal(true)}
                        className="text-[11px] font-semibold text-primary-700 hover:text-primary-800 hover:underline flex items-center space-x-1 bg-white px-2 py-0.5 rounded border border-gray-300 shadow-2xs"
                      >
                        <span>⚙️ Manage Thekedars (Admin)</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-8">
                        <select
                          value={selectedThekedar}
                          onChange={(e) => setSelectedThekedar(e.target.value)}
                          className="input-field text-xs bg-white font-semibold text-gray-900 border-amber-300 focus:border-amber-500"
                          required
                        >
                          <option value="">-- Select Thekedar / Contractor --</option>
                          {thekedars.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-4">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="👥 Manpower"
                          value={manpower}
                          onChange={(e) => setManpower(e.target.value)}
                          className="input-field text-xs bg-white font-semibold text-gray-900 border-amber-300 focus:border-amber-500"
                          title="Number of workers / labors deployed by this Thekedar"
                        />
                      </div>
                    </div>

                    {/* Quick chips for easy 1-click select */}
                    {thekedars.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-gray-500 font-medium">Quick Select:</span>
                        {thekedars.slice(0, 5).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setSelectedThekedar(t)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                              selectedThekedar === t
                                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                                : 'bg-white text-gray-700 border-amber-200 hover:border-amber-400 hover:bg-amber-50'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-amber-800/80">
                    Production entries are categorized under this Thekedar along with deployed manpower for accounting.
                  </p>
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

              <div className="flex flex-wrap items-center gap-2">
                {thekedars.length > 0 && (
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs text-gray-500 font-medium">Thekedar:</span>
                    <select
                      value={logThekedarFilter}
                      onChange={(e) => setLogThekedarFilter(e.target.value)}
                      className="text-xs border border-gray-300 rounded-lg px-2.5 py-1.5 bg-gray-50 text-gray-800 font-semibold focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="all">All Thekedars ({logEntries.length})</option>
                      {thekedars.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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

            {/* Log Table / List - 100% width with ZERO horizontal scroll */}
            {loadingLog ? (
              <div className="card py-16 flex justify-center">
                <LoadingSpinner message="Fetching daily production log..." size="md" />
              </div>
            ) : displayedLogEntries.length === 0 ? (
              <div className="card py-12 text-center text-gray-500 bg-white border border-gray-200 rounded-xl">
                <div className="flex flex-col items-center justify-center space-y-2">
                  <span className="text-3xl">📦</span>
                  <p className="font-semibold text-gray-700">
                    {logThekedarFilter !== 'all'
                      ? `No production entries found for Thekedar "${logThekedarFilter}" on ${productionDate}.`
                      : `No production entries recorded for ${productionDate} yet.`}
                  </p>
                  <p className="text-xs text-gray-400">
                    Use the batch form on the left to record manufactured units.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedByThekedar.map((category) => (
                  <div
                    key={category.thekedar}
                    className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden"
                  >
                    {/* Thekedar Category Header */}
                    <div className="bg-gradient-to-r from-amber-500/10 via-amber-100/40 to-transparent p-3 sm:px-4 sm:py-3 border-b border-amber-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center text-base font-bold shadow-2xs border border-amber-200">
                          👷
                        </div>
                        <div>
                          <h3 className="text-sm font-extrabold text-amber-950 flex items-center space-x-2">
                            <span>{category.thekedar}</span>
                            <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full border border-amber-300">
                              {category.entries.length} {category.entries.length === 1 ? 'batch' : 'batches'}
                            </span>
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 text-xs">
                        {category.manpower && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-white text-indigo-800 border border-indigo-200 shadow-2xs">
                            👥 {category.manpower} {category.manpower === 1 ? 'worker' : 'workers'}
                          </span>
                        )}
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                          +{category.totalUnits.toLocaleString()} units
                        </span>
                      </div>
                    </div>

                    {/* Desktop & Tablet Table for this Thekedar */}
                    <div className="hidden sm:block">
                      <table className="w-full divide-y divide-gray-100 text-xs">
                        <thead>
                          <tr className="bg-gray-50/80 text-gray-500 font-semibold uppercase tracking-wider text-[10px]">
                            <th scope="col" className="px-3 py-2 text-left w-20">Time</th>
                            <th scope="col" className="px-3 py-2 text-left">Cooler Model</th>
                            <th scope="col" className="px-3 py-2 text-center w-24">Manpower</th>
                            <th scope="col" className="px-3 py-2 text-right w-24">Quantity</th>
                            <th scope="col" className="px-3 py-2 text-right w-28">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {category.entries.map((row, idx) => {
                            const isToday = isEntryFromToday(row);
                            const isAuthor = !row.employee_id || row.employee_id === employee?.id;
                            const canModify = isAdmin || (isToday && isAuthor);

                            return (
                              <tr key={row.id || idx} className="hover:bg-gray-50/60 transition-colors">
                                {/* Time & Staff */}
                                <td className="px-3 py-2.5 whitespace-nowrap">
                                  <span className="font-mono text-gray-700 font-bold block">
                                    {formatTime(row.created_at)}
                                  </span>
                                  <span className="text-[10px] text-gray-400 block truncate max-w-[80px]" title={row.employee_name}>
                                    {row.employee_name || 'Staff'}
                                  </span>
                                </td>

                                {/* Cooler Model & Remarks */}
                                <td className="px-3 py-2.5 min-w-0">
                                  <div className="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                                    <span className="font-mono font-bold text-xs text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">
                                      {row.model_code}
                                    </span>
                                    <span className="text-xs font-semibold text-gray-900 truncate max-w-[180px] xl:max-w-sm">
                                      {row.model_name}
                                    </span>
                                  </div>
                                  {row.remarks && (
                                    <p className="text-[10px] text-gray-400 mt-0.5 italic truncate max-w-[220px] xl:max-w-md">
                                      Note: {row.remarks}
                                    </p>
                                  )}
                                </td>

                                {/* Manpower */}
                                <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                  {row.manpower ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                      👥 {row.manpower}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300 text-xs">—</span>
                                  )}
                                </td>

                                {/* Quantity */}
                                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    +{Number(row.quantity).toLocaleString()}
                                  </span>
                                </td>

                                {/* Actions (Always visible without scrolling) */}
                                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                  {canModify ? (
                                    <div className="flex items-center justify-end space-x-1">
                                      <button
                                        type="button"
                                        onClick={() => handleOpenEditModal(row)}
                                        className="px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors text-xs font-bold flex items-center space-x-0.5 border border-blue-200 shadow-2xs"
                                        title="Edit quantity, model, Thekedar, or manpower"
                                      >
                                        <span>✏️</span>
                                        <span>Edit</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeletingEntry(row)}
                                        className="px-2 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors text-xs font-bold flex items-center space-x-0.5 border border-red-200 shadow-2xs"
                                        title="Delete entry and deduct from stock"
                                      >
                                        <span>🗑️</span>
                                        <span>Del</span>
                                      </button>
                                    </div>
                                  ) : (
                                    <span
                                      className="inline-flex items-center space-x-1 text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200"
                                      title={!isToday ? 'Locked: Past date entries cannot be edited/deleted' : 'Locked: Only author can edit/delete'}
                                    >
                                      <span>🔒</span>
                                      <span>Locked</span>
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Cards for this Thekedar */}
                    <div className="block sm:hidden divide-y divide-gray-100">
                      {category.entries.map((row, idx) => {
                        const isToday = isEntryFromToday(row);
                        const isAuthor = !row.employee_id || row.employee_id === employee?.id;
                        const canModify = isAdmin || (isToday && isAuthor);

                        return (
                          <div key={row.id || idx} className="p-3 hover:bg-gray-50/60 transition-colors space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                                  <span className="font-mono font-bold text-xs text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded border border-primary-100">
                                    {row.model_code}
                                  </span>
                                  <span className="text-xs font-semibold text-gray-900 truncate">
                                    {row.model_name}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-2 text-[11px] text-gray-500 mt-1 flex-wrap">
                                  <span>{formatTime(row.created_at)}</span>
                                  <span>•</span>
                                  <span>{row.employee_name || 'Staff'}</span>
                                  {row.manpower && (
                                    <>
                                      <span>•</span>
                                      <span className="text-indigo-700 font-medium">👥 {row.manpower} workers</span>
                                    </>
                                  )}
                                </div>
                                {row.remarks && (
                                  <p className="text-[10px] text-gray-400 mt-1 italic truncate">
                                    Note: {row.remarks}
                                  </p>
                                )}
                              </div>

                              <div className="flex flex-col items-end space-y-1.5 flex-shrink-0">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                  +{Number(row.quantity).toLocaleString()} units
                                </span>

                                {canModify ? (
                                  <div className="flex items-center space-x-1">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditModal(row)}
                                      className="px-2 py-0.5 text-blue-600 hover:bg-blue-50 rounded border border-blue-200 text-xs font-bold"
                                    >
                                      ✏️ Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeletingEntry(row)}
                                      className="px-2 py-0.5 text-red-600 hover:bg-red-50 rounded border border-red-200 text-xs font-bold"
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border">
                                    🔒 Locked
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ADMIN ONLY: Manage Thekedars Modal */}
        {isAdmin && showManageThekedarsModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scaleUp">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-2xl">👷</span>
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                      <span>Manage Assembly Thekedars</span>
                      <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full uppercase">
                        Admin Only
                      </span>
                    </h3>
                    <p className="text-xs text-gray-500">
                      Add new contractors or remove existing ones from factory production.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManageThekedarsModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 text-base font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Form: Add New Contractor */}
              <form onSubmit={handleAddNewThekedar} className="space-y-2 p-3.5 bg-gray-50 rounded-xl border border-gray-200">
                <label className="text-xs font-bold text-gray-700 block">
                  Add New Thekedar Name:
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={newThekedarName}
                    onChange={(e) => setNewThekedarName(e.target.value)}
                    placeholder="e.g. Raju Thekedar"
                    className="input-field text-xs bg-white font-medium flex-1"
                    disabled={savingThekedar}
                  />
                  <button
                    type="submit"
                    disabled={savingThekedar || !newThekedarName.trim()}
                    className="btn-primary text-xs py-2 px-3 inline-flex items-center space-x-1 shadow-sm font-bold whitespace-nowrap"
                  >
                    <span>+ Add</span>
                  </button>
                </div>
              </form>

              {/* List of Current Thekedars with Remove buttons */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Current Thekedars ({thekedars.length})
                  </span>
                  <span className="text-[11px] text-gray-400">Click remove to delete</span>
                </div>

                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 divide-y divide-gray-100 border border-gray-200 rounded-xl p-2 bg-white">
                  {thekedars.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No Thekedars registered.</p>
                  ) : (
                    thekedars.map((t) => (
                      <div key={t} className="flex items-center justify-between py-2 px-2 hover:bg-gray-50 rounded-lg group">
                        <div className="flex items-center space-x-2 text-xs font-semibold text-gray-800">
                          <span>👷</span>
                          <span>{t}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveThekedar(t)}
                          disabled={savingThekedar}
                          className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2 py-1 rounded transition-colors font-medium flex items-center space-x-1 border border-red-200"
                          title={`Remove ${t}`}
                        >
                          <span>🗑️</span>
                          <span>Remove</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <Link
                  href="/admin?section=thekedars"
                  className="text-xs font-semibold text-primary-700 hover:underline"
                >
                  Open Full Admin Panel →
                </Link>
                <button
                  type="button"
                  onClick={() => setShowManageThekedarsModal(false)}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EDIT PRODUCTION ENTRY MODAL */}
        {editingEntry && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">✏️</span>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      Edit Production Entry
                    </h3>
                    <p className="text-xs text-gray-500">
                      Logged on {editingEntry.production_date} by {editingEntry.employee_name || 'You'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingEntry(null)}
                  disabled={savingEdit}
                  className="text-gray-400 hover:text-gray-600 p-1 text-base font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                {/* Model Selection */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Cooler Model <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editModelId}
                    onChange={(e) => setEditModelId(e.target.value)}
                    className="input-field text-xs bg-white font-semibold text-gray-900"
                    required
                  >
                    <option value="">-- Select Model --</option>
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.code} - {m.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity & Manpower */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Quantity (Units Manufactured) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      className="input-field text-sm font-bold font-mono bg-white"
                      placeholder="e.g. 50"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      👥 Manpower (Workers)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={editManpower}
                      onChange={(e) => setEditManpower(e.target.value)}
                      className="input-field text-sm font-bold font-mono bg-white"
                      placeholder="e.g. 8"
                    />
                  </div>
                </div>
                <span className="text-[11px] text-gray-400 -mt-2 block">
                  Current stock balance will automatically adjust to reflect the new count.
                </span>

                {/* Thekedar (Contractor) */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Thekedar (Assembly Contractor) <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editThekedar}
                    onChange={(e) => setEditThekedar(e.target.value)}
                    className="input-field text-xs bg-white font-semibold text-gray-900"
                    required
                  >
                    <option value="">-- Select Thekedar --</option>
                    {thekedars.map((t) => (
                      <option key={t} value={t}>
                        👷 {t}
                      </option>
                    ))}
                    {!thekedars.includes(editThekedar) && editThekedar && (
                      <option value={editThekedar}>👷 {editThekedar}</option>
                    )}
                  </select>
                </div>

                {/* Remarks */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Shift Notes / Remarks
                  </label>
                  <textarea
                    rows={2}
                    value={editRemarks}
                    onChange={(e) => setEditRemarks(e.target.value)}
                    placeholder="Optional remarks"
                    className="input-field text-xs"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setEditingEntry(null)}
                    disabled={savingEdit}
                    className="btn-secondary text-xs py-2 px-3"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit || !editQuantity || parseInt(editQuantity, 10) <= 0 || !editModelId}
                    className="btn-primary text-xs py-2 px-4 shadow-sm font-bold inline-flex items-center space-x-1.5"
                  >
                    {savingEdit ? (
                      <>
                        <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* DELETE CONFIRMATION MODAL */}
        {deletingEntry && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp border-t-4 border-red-500">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center space-x-2 text-red-600">
                  <span className="text-2xl">⚠️</span>
                  <h3 className="text-base font-bold text-gray-900">
                    Delete Production Entry?
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDeletingEntry(null)}
                  disabled={deleting}
                  className="text-gray-400 hover:text-gray-600 p-1 text-base font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="p-3.5 bg-red-50/60 rounded-xl text-xs space-y-1.5 border border-red-100">
                <div className="flex justify-between">
                  <span className="text-gray-500">Model:</span>
                  <span className="font-bold text-gray-900">
                    {deletingEntry.model_code} - {deletingEntry.model_name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Quantity to Deduct:</span>
                  <span className="font-extrabold text-red-600">
                    -{deletingEntry.quantity} units
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Thekedar:</span>
                  <span className="font-semibold text-amber-800">
                    {deletingEntry.contractor_name || 'General Assembly'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Date:</span>
                  <span className="font-medium text-gray-700">{deletingEntry.production_date}</span>
                </div>
              </div>

              <p className="text-xs text-gray-600">
                Are you sure you want to delete this production entry? This will automatically reverse the stock ledger and reduce current stock by <strong className="text-red-700">{deletingEntry.quantity} units</strong>.
              </p>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setDeletingEntry(null)}
                  disabled={deleting}
                  className="btn-secondary text-xs py-2 px-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-sm inline-flex items-center space-x-1.5 transition-colors"
                >
                  {deleting ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Yes, Delete Entry</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
