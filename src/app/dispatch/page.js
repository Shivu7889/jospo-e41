'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatsCard from '@/components/StatsCard';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getSupabase } from '@/lib/supabase';
import { getTodayIST } from '@/lib/date';
import DeliveryChallanModal from '@/components/DeliveryChallanModal';
import { exportToExcel } from '@/lib/exportExcel';

export default function DispatchListPage() {
  const router = useRouter();
  const { employee } = useAuth();
  const { showToast } = useToast();
  const supabase = getSupabase();

  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'draft' | 'confirmed' | 'cancelled'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Row expansion state (Set of dispatch ids)
  const [expandedRows, setExpandedRows] = useState(new Set());

  // Confirm Modal state
  const [confirmModalData, setConfirmModalData] = useState(null); // dispatch object
  const [confirming, setConfirming] = useState(false);

  // Cancel Modal state
  const [cancelModalData, setCancelModalData] = useState(null); // dispatch object
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Delete Draft Modal state
  const [deleteModalData, setDeleteModalData] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // View Details Modal state
  const [viewDetailsModal, setViewDetailsModal] = useState(null);

  // Delivery Challan & Gate Pass Modal state
  const [challanModalDispatch, setChallanModalDispatch] = useState(null);

  // Edit Dispatch Modal state (Admin can edit any dispatch)
  const [editDispatchModal, setEditDispatchModal] = useState(null);
  const [editVehicleNumber, setEditVehicleNumber] = useState('');
  const [editDestination, setEditDestination] = useState('');
  const [editFromLocation, setEditFromLocation] = useState('Jospo E41');
  const [editDispatchDate, setEditDispatchDate] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [savingDispatchEdit, setSavingDispatchEdit] = useState(false);

  // Fetch dispatches
  const fetchDispatches = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const { data, error } = await supabase
        .from('dispatches')
        .select(`
          *,
          dispatch_items(
            id,
            quantity,
            model_id,
            cooler_models(
              id,
              name,
              code,
              qr_data
            )
          ),
          employees!dispatches_employee_id_fkey(
            name
          ),
          cancelled_by_employee:employees!dispatches_cancelled_by_fkey(
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDispatches(data || []);
    } catch (err) {
      console.error('Error fetching dispatches:', err);
      showToast(err.message || 'Failed to load dispatches', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supabase, showToast]);

  useEffect(() => {
    fetchDispatches();
  }, [fetchDispatches]);

  // Toggle row expansion
  const toggleRowExpansion = (dispatchId) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(dispatchId)) {
        next.delete(dispatchId);
      } else {
        next.add(dispatchId);
      }
      return next;
    });
  };

  // Helper to calculate total quantity for a dispatch
  const calculateTotalQty = (items = []) => {
    return items.reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
  };

  // Filtered dispatches
  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      // Status filter
      if (statusFilter !== 'all' && d.status !== statusFilter) {
        return false;
      }
      // Date from filter
      if (dateFrom && d.dispatch_date < dateFrom) {
        return false;
      }
      // Date to filter
      if (dateTo && d.dispatch_date > dateTo) {
        return false;
      }
      // Search term (vehicle number, destination, remarks, employee name)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchVehicle = d.vehicle_number?.toLowerCase().includes(query);
        const matchDest = d.destination?.toLowerCase().includes(query);
        const matchFrom = d.from_location?.toLowerCase().includes(query);
        const matchRemarks = d.remarks?.toLowerCase().includes(query);
        const matchEmployee = d.employees?.name?.toLowerCase().includes(query);
        const matchModel = d.dispatch_items?.some(
          (di) =>
            di.cooler_models?.code?.toLowerCase().includes(query) ||
            di.cooler_models?.name?.toLowerCase().includes(query)
        );

        return matchVehicle || matchDest || matchFrom || matchRemarks || matchEmployee || matchModel;
      }
      return true;
    });
  }, [dispatches, statusFilter, dateFrom, dateTo, searchTerm]);

  // Aggregate stats
  const stats = useMemo(() => {
    const todayStr = getTodayIST();
    const total = dispatches.length;
    const drafts = dispatches.filter((d) => d.status === 'draft').length;
    const confirmedToday = dispatches.filter(
      (d) => d.status === 'confirmed' && d.dispatch_date === todayStr
    ).length;
    const totalUnitsDispatched = dispatches
      .filter((d) => d.status === 'confirmed')
      .reduce((sum, d) => sum + calculateTotalQty(d.dispatch_items), 0);

    return { total, drafts, confirmedToday, totalUnitsDispatched };
  }, [dispatches]);

  // Handle Confirm Dispatch via RPC
  const handleConfirmDispatch = async () => {
    if (!confirmModalData || !employee?.id) return;
    try {
      setConfirming(true);
      const { data, error } = await supabase.rpc('confirm_dispatch', {
        p_dispatch_id: confirmModalData.id,
        p_employee_id: employee.id,
      });

      if (error) throw error;

      if (data && data.success === false) {
        throw new Error(data.error || 'Failed to confirm dispatch');
      }

      showToast(`Dispatch ${confirmModalData.vehicle_number} successfully confirmed and stock deducted!`, 'success');
      setConfirmModalData(null);
      await fetchDispatches(true);
    } catch (err) {
      console.error('Error confirming dispatch:', err);
      showToast(err.message || 'Failed to confirm dispatch', 'error');
    } finally {
      setConfirming(false);
    }
  };

  // Handle Cancel Dispatch via RPC (Admin Only)
  const handleCancelDispatch = async () => {
    if (!cancelModalData || !employee?.id) return;
    if (!cancelReason.trim()) {
      showToast('Please provide a reason for cancelling this dispatch.', 'warning');
      return;
    }
    try {
      setCancelling(true);
      const { data, error } = await supabase.rpc('cancel_dispatch', {
        p_dispatch_id: cancelModalData.id,
        p_employee_id: employee.id,
        p_reason: cancelReason.trim(),
      });

      if (error) throw error;

      if (data && data.success === false) {
        throw new Error(data.error || 'Failed to cancel dispatch');
      }

      showToast(`Dispatch ${cancelModalData.vehicle_number} cancelled and stock reversed.`, 'success');
      setCancelModalData(null);
      setCancelReason('');
      await fetchDispatches(true);
    } catch (err) {
      console.error('Error cancelling dispatch:', err);
      showToast(err.message || 'Failed to cancel dispatch', 'error');
    } finally {
      setCancelling(false);
    }
  };

  // Handle Delete Dispatch (Admin can delete any dispatch; dispatch staff can delete drafts)
  const handleDeleteDraft = async () => {
    if (!deleteModalData) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/dispatch/${deleteModalData.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete dispatch');
      }

      showToast(data.message || `Dispatch for ${deleteModalData.vehicle_number} deleted.`, 'success');
      setDeleteModalData(null);
      await fetchDispatches(true);
    } catch (err) {
      console.error('Error deleting dispatch:', err);
      showToast(err.message || 'Failed to delete dispatch', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // Open Edit Dispatch Modal (for Admin)
  const handleOpenEditDispatch = (dispatch) => {
    setEditDispatchModal(dispatch);
    setEditVehicleNumber(dispatch.vehicle_number || '');
    setEditDestination(dispatch.destination || '');
    setEditFromLocation(dispatch.from_location || 'Jospo E41');
    setEditDispatchDate(dispatch.dispatch_date || getTodayIST());
    setEditRemarks(dispatch.remarks || '');
  };

  // Save Dispatch Edit
  const handleSaveDispatchEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editDispatchModal) return;

    const vNum = editVehicleNumber.trim().toUpperCase();
    const dest = editDestination.trim();
    if (!vNum) {
      showToast('Vehicle number is required', 'warning');
      return;
    }
    if (!dest) {
      showToast('Destination is required', 'warning');
      return;
    }

    try {
      setSavingDispatchEdit(true);
      const res = await fetch(`/api/dispatch/${editDispatchModal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_number: vNum,
          destination: dest,
          from_location: editFromLocation.trim(),
          dispatch_date: editDispatchDate,
          remarks: editRemarks.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update dispatch');
      }

      showToast(`Dispatch ${vNum} updated successfully`, 'success');
      setEditDispatchModal(null);
      await fetchDispatches(true);
    } catch (err) {
      console.error('Error updating dispatch:', err);
      showToast(err.message || 'Error updating dispatch', 'error');
    } finally {
      setSavingDispatchEdit(false);
    }
  };

  // Export filtered dispatches to Excel (.xlsx)
  const handleExportExcel = () => {
    if (!filteredDispatches.length) {
      showToast('No dispatches to export matching current filters.', 'warning');
      return;
    }

    const rows = filteredDispatches.map((d, idx) => {
      const itemsSummary = (d.dispatch_items || [])
        .map((it) => `${it.cooler_models?.code || 'Cooler'}: ${it.quantity} pcs`)
        .join(', ');
      return {
        'S.No': idx + 1,
        'Dispatch Date': d.dispatch_date || '',
        'Vehicle Number': d.vehicle_number || '',
        'Status': (d.status || '').toUpperCase(),
        'Destination': d.destination || '',
        'Origin Location': d.from_location || 'Jospo E41',
        'Total Quantity (pcs)': calculateTotalQty(d.dispatch_items),
        'Models Breakdown': itemsSummary,
        'Created By': d.employees?.name || 'Staff',
        'Remarks': d.remarks || '',
      };
    });

    const dateStr = getTodayIST();
    exportToExcel(rows, `Jospo_Dispatches_${dateStr}`, 'Dispatches');
    showToast(`Exported ${rows.length} dispatch records to Excel`, 'success');
  };

  // Status Badge Component
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return <span className="badge-success">Confirmed</span>;
      case 'draft':
        return <span className="badge-warning">Draft</span>;
      case 'cancelled':
        return <span className="badge-danger">Cancelled</span>;
      default:
        return <span className="badge-info">{status}</span>;
    }
  };

  const isAdmin = employee?.role === 'admin';

  return (
    <AppShell allowedRoles={['admin', 'dispatch']}>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Dispatch Management
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Track vehicle dispatches, QR code loading records, and outward stock movements.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => fetchDispatches(true)}
              disabled={refreshing || loading}
              className="btn-secondary text-sm inline-flex items-center space-x-1.5"
              title="Refresh dispatches"
            >
              <svg
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
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
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <Link
              href="/dispatch/new"
              className="btn-primary text-sm inline-flex items-center space-x-2 shadow-sm"
            >
              <span className="text-base">📦</span>
              <span>+ New Dispatch (Scan QR)</span>
            </Link>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatsCard
            title="Total Dispatches"
            value={stats.total}
            icon="🚚"
            color="indigo"
            subtitle="All-time dispatches"
          />
          <StatsCard
            title="Today's Confirmed"
            value={stats.confirmedToday}
            icon="✅"
            color="green"
            subtitle="Dispatched today"
          />
          <StatsCard
            title="Pending Drafts"
            value={stats.drafts}
            icon="⏳"
            color="yellow"
            subtitle="Awaiting confirmation"
          />
          <StatsCard
            title="Confirmed Units"
            value={stats.totalUnitsDispatched}
            icon="❄️"
            color="blue"
            subtitle="Coolers dispatched"
          />
        </div>

        {/* Filters and Controls Card */}
        <div className="card space-y-4">
          {/* Status Tabs & Search */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            {/* Status Filter Tabs */}
            <div className="inline-flex p-1 bg-gray-100 rounded-xl space-x-1 overflow-x-auto max-w-full">
              {[
                { id: 'all', label: 'All Dispatches' },
                { id: 'draft', label: 'Drafts' },
                { id: 'confirmed', label: 'Confirmed' },
                { id: 'cancelled', label: 'Cancelled' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-white text-primary-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 md:max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search vehicle, destination..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-9 text-xs sm:text-sm py-1.5"
              />
            </div>
          </div>

          {/* Date Range Picker */}
          <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-3 text-xs sm:text-sm">
            <span className="font-medium text-gray-700">Filter by Date:</span>
            <div className="flex items-center space-x-2">
              <label htmlFor="dateFrom" className="text-gray-500">From:</label>
              <input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-2.5 py-1 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-center space-x-2">
              <label htmlFor="dateTo" className="text-gray-500">To:</label>
              <input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-2.5 py-1 text-xs border border-gray-300 rounded-md focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div className="ml-auto flex items-center space-x-3">
              {(dateFrom || dateTo || searchTerm || statusFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                  className="text-xs text-primary-600 hover:text-primary-800 font-semibold underline"
                >
                  Clear all filters
                </button>
              )}
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={loading || !filteredDispatches.length}
                className="btn-success text-xs py-1.5 px-3 inline-flex items-center space-x-1 shadow-xs font-semibold"
                title="Download filtered dispatches as Excel spreadsheet"
              >
                <span>📥</span>
                <span>Export Excel</span>
              </button>
            </div>
          </div>
        </div>

        {/* Dispatches Table */}
        <div className="card overflow-hidden p-0 border border-gray-200">
          {loading ? (
            <div className="py-16 text-center">
              <LoadingSpinner message="Loading dispatch records..." size="md" />
            </div>
          ) : filteredDispatches.length === 0 ? (
            <div className="py-16 text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center text-2xl mx-auto mb-3">
                🚚
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">No Dispatches Found</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mb-5">
                {searchTerm || dateFrom || dateTo || statusFilter !== 'all'
                  ? 'No dispatches match your current filter settings. Try clearing the filters.'
                  : 'No dispatch records have been created yet. Create a new dispatch with QR scanning.'}
              </p>
              <Link href="/dispatch/new" className="btn-primary text-xs py-2 px-4 inline-flex items-center space-x-2">
                <span>+ Create First Dispatch</span>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th scope="col" className="w-10 px-3 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {/* Expansion chevron */}
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Vehicle Number
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Route
                    </th>
                    <th scope="col" className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Total Qty
                    </th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredDispatches.map((dispatch) => {
                    const isExpanded = expandedRows.has(dispatch.id);
                    const totalQty = calculateTotalQty(dispatch.dispatch_items);
                    const itemCount = dispatch.dispatch_items?.length || 0;

                    return (
                      <React.Fragment key={dispatch.id}>
                        <tr
                          className={`hover:bg-primary-50/30 transition-colors cursor-pointer ${
                            isExpanded ? 'bg-primary-50/20' : ''
                          }`}
                          onClick={() => toggleRowExpansion(dispatch.id)}
                        >
                          {/* Expansion arrow */}
                          <td className="px-3 py-3.5 text-center text-gray-400">
                            <span
                              className={`inline-block transition-transform duration-200 text-xs ${
                                isExpanded ? 'transform rotate-90 text-primary-600 font-bold' : ''
                              }`}
                            >
                              ▶
                            </span>
                          </td>

                          {/* Date */}
                          <td className="whitespace-nowrap px-4 py-3.5 text-gray-900 font-medium">
                            <div>{dispatch.dispatch_date}</div>
                            <div className="text-[11px] text-gray-500">
                              by {dispatch.employees?.name || 'Staff'}
                            </div>
                          </td>

                          {/* Vehicle Number */}
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                              {dispatch.vehicle_number}
                            </span>
                          </td>

                          {/* Route: From -> Destination */}
                          <td className="px-4 py-3.5 text-gray-700">
                            <div className="flex items-center space-x-1.5 font-medium">
                              <span className="text-gray-500 text-xs">{dispatch.from_location}</span>
                              <span className="text-primary-600">→</span>
                              <span className="text-gray-900">{dispatch.destination}</span>
                            </div>
                            {dispatch.remarks && (
                              <p className="text-xs text-gray-500 truncate max-w-xs mt-0.5">
                                Note: {dispatch.remarks}
                              </p>
                            )}
                          </td>

                          {/* Total Quantity */}
                          <td className="whitespace-nowrap px-4 py-3.5 text-center">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-800 border border-gray-200">
                              {totalQty} pcs
                            </span>
                            <span className="block text-[10px] text-gray-500 mt-0.5">
                              {itemCount} model{itemCount !== 1 ? 's' : ''}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="whitespace-nowrap px-4 py-3.5">
                            {renderStatusBadge(dispatch.status)}
                          </td>

                          {/* Action Buttons (Stop propagation so row click toggles expansion) */}
                          <td
                            className="whitespace-nowrap px-4 py-3.5 text-right text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end space-x-2">
                              {/* Details button always available */}
                              <button
                                type="button"
                                onClick={() => setViewDetailsModal(dispatch)}
                                className="px-2.5 py-1 text-xs font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                              >
                                Details
                              </button>

                              {/* Gate Pass button */}
                              <button
                                type="button"
                                onClick={() => setChallanModalDispatch(dispatch)}
                                className="px-2.5 py-1 text-xs font-semibold text-primary-700 hover:text-primary-800 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors border border-primary-200 inline-flex items-center space-x-1"
                                title="Print Delivery Challan & Gate Pass"
                              >
                                <span>🖨️ Gate Pass</span>
                              </button>

                              {/* Draft actions: Edit, Confirm, Delete */}
                              {dispatch.status === 'draft' && (
                                <>
                                  <Link
                                    href={`/dispatch/new?id=${dispatch.id}`}
                                    className="px-2.5 py-1 text-xs font-medium text-primary-700 hover:text-primary-800 bg-primary-50 hover:bg-primary-100 rounded-md transition-colors"
                                  >
                                    Edit
                                  </Link>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmModalData(dispatch)}
                                    className="px-2.5 py-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors border border-emerald-200"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteModalData(dispatch)}
                                    className="px-2 py-1 text-xs font-medium text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors"
                                    title="Delete Draft"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}

                              {/* Confirmed actions: Admin Edit, Cancel, Delete */}
                              {dispatch.status === 'confirmed' && isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDispatch(dispatch)}
                                    className="px-2 py-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-200"
                                    title="Edit dispatch details"
                                  >
                                    ✏️ Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCancelModalData(dispatch)}
                                    className="px-2.5 py-1 text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors border border-amber-200"
                                  >
                                    Cancel Dispatch
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteModalData(dispatch)}
                                    className="px-2 py-1 text-xs font-medium text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors border border-rose-200"
                                    title="Delete Confirmed Dispatch"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}

                              {/* Cancelled actions: Admin Edit & Delete */}
                              {dispatch.status === 'cancelled' && isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDispatch(dispatch)}
                                    className="px-2 py-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-200"
                                    title="Edit dispatch details"
                                  >
                                    ✏️ Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteModalData(dispatch)}
                                    className="px-2 py-1 text-xs font-medium text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors border border-rose-200"
                                    title="Delete Cancelled Dispatch"
                                  >
                                    🗑️
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Collapsible Row: Model-wise Item Breakdown */}
                        {isExpanded && (
                          <tr className="bg-gray-50/70 border-b border-gray-200 animate-fadeIn">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                                <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center space-x-1.5">
                                    <span>📦 Dispatch Items Breakdown</span>
                                    <span className="text-gray-400 font-normal">
                                      ({dispatch.dispatch_items?.length || 0} unique models)
                                    </span>
                                  </h4>
                                  <span className="text-xs font-bold text-gray-900">
                                    Total: {totalQty} Units
                                  </span>
                                </div>

                                {(!dispatch.dispatch_items || dispatch.dispatch_items.length === 0) ? (
                                  <p className="text-xs text-gray-500 italic py-2">
                                    No items recorded for this dispatch yet.
                                  </p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-100 text-xs">
                                      <thead>
                                        <tr className="text-gray-500 text-left">
                                          <th className="py-1.5 px-3 font-semibold uppercase">Model Code</th>
                                          <th className="py-1.5 px-3 font-semibold uppercase">Model Name</th>
                                          <th className="py-1.5 px-3 font-semibold uppercase text-right">Quantity</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-100">
                                        {dispatch.dispatch_items.map((item, idx) => (
                                          <tr key={item.id || idx} className="hover:bg-gray-50">
                                            <td className="py-2 px-3 font-mono font-bold text-primary-700">
                                              {item.cooler_models?.code || '—'}
                                            </td>
                                            <td className="py-2 px-3">
                                              <span className="font-bold text-gray-900 block">{item.cooler_models?.name || 'Cooler Model'}</span>
                                              <span className="font-mono text-gray-400 text-[10px]">{item.cooler_models?.code}</span>
                                            </td>
                                            <td className="py-2 px-3 text-right font-extrabold text-gray-900">
                                              {item.quantity} pcs
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}

                                {dispatch.cancellation_reason && (
                                  <div className="mt-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                                    <span className="font-bold">Cancellation Reason:</span> {dispatch.cancellation_reason}
                                    {dispatch.cancelled_by_employee?.name && (
                                      <span className="block text-[11px] text-rose-600 mt-0.5">
                                        Cancelled by: {dispatch.cancelled_by_employee.name}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal: Confirm Dispatch */}
        {confirmModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="card max-w-md w-full p-6 shadow-2xl animate-scaleUp">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">
                  ✓
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Confirm Dispatch</h3>
                  <p className="text-xs text-gray-500">Atomic Stock Deduction</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-3.5 mb-4 border border-gray-200 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Vehicle:</span>
                  <span className="font-mono font-bold text-gray-900">{confirmModalData.vehicle_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Destination:</span>
                  <span className="font-semibold text-gray-900">{confirmModalData.destination}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Coolers:</span>
                  <span className="font-bold text-primary-700">
                    {calculateTotalQty(confirmModalData.dispatch_items)} pcs
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-600 mb-6 leading-relaxed">
                Confirming will lock this dispatch and immediately deduct all item quantities from active inventory.
                Are you sure you want to proceed?
              </p>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setConfirmModalData(null)}
                  disabled={confirming}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDispatch}
                  disabled={confirming}
                  className="btn-success text-xs py-2 px-4 shadow-sm"
                >
                  {confirming ? 'Deducting Stock...' : 'Confirm & Deduct Stock'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Cancel Dispatch (Admin Only) */}
        {cancelModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="card max-w-md w-full p-6 shadow-2xl animate-scaleUp">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-xl">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Cancel Confirmed Dispatch</h3>
                  <p className="text-xs text-rose-600 font-semibold">Stock Reversal Audit</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 mb-4">
                <strong>Attention:</strong> Cancelling this confirmed dispatch will automatically return{' '}
                <strong>{calculateTotalQty(cancelModalData.dispatch_items)} pcs</strong> back to inventory as a{' '}
                <em>dispatch_reversal</em> audit entry.
              </div>

              <div className="mb-4">
                <label className="label text-xs">
                  Reason for Cancellation <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g., Vehicle mechanical failure, wrong order shipment, client cancelled..."
                  className="input-field text-xs"
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setCancelModalData(null);
                    setCancelReason('');
                  }}
                  disabled={cancelling}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Abort
                </button>
                <button
                  type="button"
                  onClick={handleCancelDispatch}
                  disabled={cancelling || !cancelReason.trim()}
                  className="btn-danger text-xs py-2 px-4 shadow-sm"
                >
                  {cancelling ? 'Reversing Stock...' : 'Cancel Dispatch & Return Stock'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Delete Dispatch */}
        {deleteModalData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="card max-w-sm w-full p-6 shadow-2xl animate-scaleUp text-center">
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-2xl mx-auto mb-3">
                🗑️
              </div>
              <h3 className="text-base font-bold text-gray-900 mb-1">
                {deleteModalData.status === 'confirmed'
                  ? 'Delete Confirmed Dispatch'
                  : deleteModalData.status === 'cancelled'
                  ? 'Delete Cancelled Dispatch'
                  : 'Delete Draft Dispatch'}
              </h3>

              {deleteModalData.status === 'confirmed' ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 text-left mb-4 leading-relaxed">
                  <p className="font-bold mb-1">⚠️ Restores Warehouse Inventory</p>
                  Deleting this confirmed dispatch for vehicle{' '}
                  <strong className="font-mono text-gray-900">{deleteModalData.vehicle_number}</strong> will permanently remove the dispatch record and{' '}
                  <strong>automatically return {calculateTotalQty(deleteModalData.dispatch_items)} pcs</strong> back to warehouse stock.
                </div>
              ) : (
                <p className="text-xs text-gray-500 mb-5 leading-relaxed">
                  Are you sure you want to permanently remove dispatch for vehicle{' '}
                  <strong className="font-mono text-gray-800">{deleteModalData.vehicle_number}</strong>? This action cannot be undone.
                </p>
              )}

              <div className="flex justify-center space-x-3">
                <button
                  type="button"
                  onClick={() => setDeleteModalData(null)}
                  disabled={deleting}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteDraft}
                  disabled={deleting}
                  className="btn-danger text-xs py-2 px-4 shadow-sm font-semibold"
                >
                  {deleting
                    ? 'Deleting...'
                    : deleteModalData.status === 'confirmed'
                    ? 'Delete & Return Stock'
                    : 'Delete Dispatch'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Edit Dispatch (Admin) */}
        {editDispatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="card max-w-lg w-full p-6 shadow-2xl animate-scaleUp">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-base">
                    ✏️
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-gray-900">
                      Edit Dispatch {editDispatchModal.vehicle_number}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Status: <span className="font-semibold capitalize">{editDispatchModal.status}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditDispatchModal(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveDispatchEdit} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Vehicle Number <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editVehicleNumber}
                      onChange={(e) => setEditVehicleNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. MP-09-AB-1234"
                      className="input-field text-xs uppercase font-mono font-bold"
                      required
                    />
                  </div>

                  <div>
                    <label className="label text-xs">Destination <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={editDestination}
                      onChange={(e) => setEditDestination(e.target.value)}
                      placeholder="e.g. Jaipur Depot, Client Warehouse"
                      className="input-field text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Origin Location</label>
                    <input
                      type="text"
                      value={editFromLocation}
                      onChange={(e) => setEditFromLocation(e.target.value)}
                      placeholder="e.g. Jospo E41"
                      className="input-field text-xs"
                    />
                  </div>

                  <div>
                    <label className="label text-xs">Dispatch Date <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={editDispatchDate}
                      onChange={(e) => setEditDispatchDate(e.target.value)}
                      className="input-field text-xs"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="label text-xs">Remarks / Notes</label>
                  <textarea
                    rows={2}
                    value={editRemarks}
                    onChange={(e) => setEditRemarks(e.target.value)}
                    placeholder="Optional remarks, driver info, e-way bill number..."
                    className="input-field text-xs"
                  />
                </div>

                {/* Link to full workstation if user wants to change models/items */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900 flex items-start space-x-2">
                  <span className="text-base">ℹ️</span>
                  <div className="text-xs leading-relaxed">
                    <p className="font-semibold">Need to modify cooler models or item quantities?</p>
                    <p className="mt-0.5 text-blue-800">
                      You can also use the full workstation to scan or adjust quantities:
                    </p>
                    <Link
                      href={`/dispatch/new?id=${editDispatchModal.id}`}
                      className="inline-block mt-1 font-bold text-primary-700 hover:underline"
                    >
                      Open in Dispatch Workstation →
                    </Link>
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setEditDispatchModal(null)}
                    disabled={savingDispatchEdit}
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingDispatchEdit}
                    className="btn-primary text-xs py-2 px-5 font-bold shadow-sm"
                  >
                    {savingDispatchEdit ? 'Saving...' : '💾 Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: View Details */}
        {viewDetailsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="card max-w-lg w-full p-6 shadow-2xl animate-scaleUp max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span>Dispatch Details</span>
                    {renderStatusBadge(viewDetailsModal.status)}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">ID: {viewDetailsModal.id}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewDetailsModal(null)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3.5 rounded-xl text-xs mb-4">
                <div>
                  <span className="text-gray-500 block">Vehicle Number:</span>
                  <span className="font-mono font-bold text-gray-900">{viewDetailsModal.vehicle_number}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Dispatch Date:</span>
                  <span className="font-medium text-gray-900">{viewDetailsModal.dispatch_date}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Origin Location:</span>
                  <span className="font-medium text-gray-900">{viewDetailsModal.from_location}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Destination:</span>
                  <span className="font-medium text-gray-900">{viewDetailsModal.destination}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Created By:</span>
                  <span className="font-medium text-gray-900">{viewDetailsModal.employees?.name || 'Staff'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Total Quantity:</span>
                  <span className="font-bold text-primary-700">
                    {calculateTotalQty(viewDetailsModal.dispatch_items)} pcs
                  </span>
                </div>
              </div>

              {viewDetailsModal.remarks && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-900">
                  <span className="font-bold">Remarks:</span> {viewDetailsModal.remarks}
                </div>
              )}

              {viewDetailsModal.cancellation_reason && (
                <div className="mb-4 bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-900">
                  <span className="font-bold">Cancelled:</span> {viewDetailsModal.cancellation_reason}
                  {viewDetailsModal.cancelled_by_employee?.name && (
                    <div className="text-[11px] text-rose-700 mt-0.5">
                      Cancelled by {viewDetailsModal.cancelled_by_employee.name}
                    </div>
                  )}
                </div>
              )}

              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                Items ({viewDetailsModal.dispatch_items?.length || 0})
              </h4>
              <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Model Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Model Code</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {viewDetailsModal.dispatch_items?.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td className="px-3 py-2 font-bold text-gray-900">{item.cooler_models?.name}</td>
                        <td className="px-3 py-2 font-mono text-gray-500 text-[11px]">
                          {item.cooler_models?.code}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-gray-900">{item.quantity} pcs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setChallanModalDispatch(viewDetailsModal)}
                  className="btn-primary text-xs py-2 px-3 inline-flex items-center space-x-1.5"
                >
                  <span>🖨️ Gate Pass</span>
                </button>
                {viewDetailsModal.status === 'draft' && (
                  <Link
                    href={`/dispatch/new?id=${viewDetailsModal.id}`}
                    className="btn-secondary text-xs py-2 px-3"
                  >
                    Edit Draft
                  </Link>
                )}
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const d = viewDetailsModal;
                        setViewDetailsModal(null);
                        handleOpenEditDispatch(d);
                      }}
                      className="px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = viewDetailsModal;
                        setViewDetailsModal(null);
                        setDeleteModalData(d);
                      }}
                      className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
                    >
                      🗑️ Delete
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setViewDetailsModal(null)}
                  className="btn-secondary text-xs py-2 px-3"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Printable Delivery Challan & Gate Pass */}
        {challanModalDispatch && (
          <DeliveryChallanModal
            dispatch={challanModalDispatch}
            onClose={() => setChallanModalDispatch(null)}
          />
        )}
      </div>
    </AppShell>
  );
}
