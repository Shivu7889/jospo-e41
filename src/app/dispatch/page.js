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
import CoLoadingModal from '@/components/CoLoadingModal';
import { exportToExcel } from '@/lib/exportExcel';
import {
  resolveDispatchType,
  getDispatchTypeMeta,
  cleanDispatchRemarks,
  isCoLoadingDispatch,
  resolveCoLoadingStatus,
  resolveNextLoadingPlant,
  resolveSecondPlant,
  resolveItemLoadedPlant,
  getCoLoadingBadge,
  isDispatchRelevantToPlant,
  getDispatchLoadedPlants,
  formatCoLoadingRoute,
} from '@/lib/dispatch';
import { usePlant } from '@/contexts/PlantContext';
import {
  PLANTS,
  ALL_PLANTS_ID,
  normalizePlant,
  resolveDestinationPlant,
  resolveTransferStatus,
  getPlantMeta,
} from '@/lib/plants';

export default function DispatchListPage() {
  const router = useRouter();
  const { employee } = useAuth();
  const { showToast } = useToast();
  const supabase = getSupabase();
  const { activePlant, isOwner, inboundTransfersCount, refreshInboundTransfersCount } = usePlant();

  const [dispatches, setDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tabs: 'outward' (dispatches from this plant) vs 'inbound' (incoming inter-plant shipments)
  const [activeTab, setActiveTab] = useState('outward');

  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'draft' | 'confirmed' | 'cancelled'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'party' | 'local'
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

  // Inbound Transfer Acceptance Modal state
  const [acceptTransferModal, setAcceptTransferModal] = useState(null);
  const [acceptNotes, setAcceptNotes] = useState('');
  const [acceptingTransfer, setAcceptingTransfer] = useState(false);

  // Delivery Challan & Gate Pass Modal state
  const [challanModalDispatch, setChallanModalDispatch] = useState(null);

  // Multi-Plant Co-Loading Modal State
  const [coLoadingModalData, setCoLoadingModalData] = useState(null);
  const [coLoadingTargetPlant, setCoLoadingTargetPlant] = useState(null);

  // Edit Dispatch Modal state (Admin & Dispatch can edit dispatch items & co-loading status)
  const [editDispatchModal, setEditDispatchModal] = useState(null);
  const [editDispatchType, setEditDispatchType] = useState('party');
  const [editVehicleNumber, setEditVehicleNumber] = useState('');
  const [editDestination, setEditDestination] = useState('');
  const [editFromLocation, setEditFromLocation] = useState('E41 G2');
  const [editDispatchDate, setEditDispatchDate] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [editIsCoLoading, setEditIsCoLoading] = useState(false);
  const [editCoLoadingStatus, setEditCoLoadingStatus] = useState('not_applicable');
  const [editNextLoadingPlant, setEditNextLoadingPlant] = useState('D4');
  const [editSecondPlant, setEditSecondPlant] = useState('');
  const [editThirdPlant, setEditThirdPlant] = useState('');
  const [editItems, setEditItems] = useState([]);
  const [availableModels, setAvailableModels] = useState([]);
  const [newItemModelId, setNewItemModelId] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPlant, setNewItemPlant] = useState('E41 G2');
  const [savingDispatchEdit, setSavingDispatchEdit] = useState(false);

  // Preload cooler models catalog for item editor dropdown
  useEffect(() => {
    async function loadCatalog() {
      try {
        const res = await fetch('/api/models?view=all');
        if (res.ok) {
          const json = await res.json();
          const list = json.models || json.data || (Array.isArray(json) ? json : []);
          if (Array.isArray(list) && list.length > 0) {
            setAvailableModels(list);
            return;
          }
        }
        if (supabase) {
          const { data } = await supabase.from('cooler_models').select('*').eq('is_active', true).order('code');
          if (data) setAvailableModels(data);
        }
      } catch (err) {
        console.warn('Failed to preload models for edit modal:', err);
      }
    }
    loadCatalog();
  }, [supabase]);

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
            *,
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

  // Filtered dispatches (scoped to activePlant)
  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      // Plant scope: if activePlant is not ALL, dispatch must be relevant to activePlant
      if (activePlant !== ALL_PLANTS_ID) {
        if (!isDispatchRelevantToPlant(d, activePlant)) return false;
      }
      // Status filter
      if (statusFilter !== 'all' && d.status !== statusFilter) {
        return false;
      }
      // Type filter (local vs party)
      const dType = resolveDispatchType(d);
      if (typeFilter !== 'all' && dType !== typeFilter) {
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
      // Search term (vehicle number, destination, remarks, employee name, dispatch type)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchVehicle = d.vehicle_number?.toLowerCase().includes(query);
        const matchDest = d.destination?.toLowerCase().includes(query);
        const matchFrom = d.from_location?.toLowerCase().includes(query);
        const matchRemarks = d.remarks?.toLowerCase().includes(query);
        const matchEmployee = d.employees?.name?.toLowerCase().includes(query);
        const matchType = dType === 'local'
          ? ('local plant inter-plant'.includes(query))
          : ('party customer client'.includes(query));
        const matchModel = d.dispatch_items?.some(
          (di) =>
            di.cooler_models?.code?.toLowerCase().includes(query) ||
            di.cooler_models?.name?.toLowerCase().includes(query)
        );

        return matchVehicle || matchDest || matchFrom || matchRemarks || matchEmployee || matchModel || matchType;
      }
      return true;
    });
  }, [dispatches, activePlant, statusFilter, typeFilter, dateFrom, dateTo, searchTerm]);

  // Incoming vehicles waiting for secondary co-loading at this plant
  const incomingCoLoadVehicles = useMemo(() => {
    return dispatches.filter((d) => {
      if (d.status !== 'confirmed') return false;
      if (!isCoLoadingDispatch(d)) return false;
      const status = resolveCoLoadingStatus(d);
      if (status !== 'part_loaded') return false;

      const nextPlant = resolveNextLoadingPlant(d);
      if (activePlant !== ALL_PLANTS_ID) {
        if (nextPlant !== activePlant) return false;
      }
      return true;
    });
  }, [dispatches, activePlant]);

  // Inbound transfers list (confirmed local transfers received or in-transit to this plant)
  const filteredInboundTransfers = useMemo(() => {
    return dispatches.filter((d) => {
      const destPlant = resolveDestinationPlant(d);
      const isLocal = resolveDispatchType(d) === 'local' || Boolean(destPlant);
      if (!isLocal || d.status !== 'confirmed') return false;

      if (activePlant !== ALL_PLANTS_ID) {
        if (destPlant !== activePlant) return false;
      }

      if (dateFrom && d.dispatch_date < dateFrom) return false;
      if (dateTo && d.dispatch_date > dateTo) return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchVehicle = d.vehicle_number?.toLowerCase().includes(query);
        const matchFrom = d.from_location?.toLowerCase().includes(query);
        const matchDest = d.destination?.toLowerCase().includes(query);
        const matchModel = d.dispatch_items?.some(
          (di) =>
            di.cooler_models?.code?.toLowerCase().includes(query) ||
            di.cooler_models?.name?.toLowerCase().includes(query)
        );
        return matchVehicle || matchFrom || matchDest || matchModel;
      }
      return true;
    });
  }, [dispatches, activePlant, dateFrom, dateTo, searchTerm]);

  // Pending inbound transfers arriving at this plant (in-transit, awaiting acceptance)
  const pendingInboundTransfers = useMemo(() => {
    return filteredInboundTransfers.filter(
      (d) => !d.received_at && resolveTransferStatus(d) === 'in_transit'
    );
  }, [filteredInboundTransfers]);

  // Aggregate stats (scoped to activePlant)
  const stats = useMemo(() => {
    const todayStr = getTodayIST();
    const relevant = activePlant === ALL_PLANTS_ID
      ? dispatches
      : dispatches.filter((d) => isDispatchRelevantToPlant(d, activePlant));

    const total = relevant.length;
    const drafts = relevant.filter((d) => d.status === 'draft').length;
    const confirmedToday = relevant.filter(
      (d) => d.status === 'confirmed' && d.dispatch_date === todayStr
    ).length;
    const totalUnitsDispatched = relevant
      .filter((d) => d.status === 'confirmed')
      .reduce((sum, d) => {
        if (activePlant === ALL_PLANTS_ID) {
          return sum + calculateTotalQty(d.dispatch_items);
        }
        const plantItems = (d.dispatch_items || []).filter(
          (it) => resolveItemLoadedPlant(it, d) === activePlant
        );
        return sum + calculateTotalQty(plantItems);
      }, 0);

    return { total, drafts, confirmedToday, totalUnitsDispatched };
  }, [dispatches, activePlant]);

  // Handle Accept Inbound Transfer (adds stock to receiving plant)
  const handleAcceptTransfer = async () => {
    if (!acceptTransferModal) return;
    try {
      setAcceptingTransfer(true);
      const res = await fetch(`/api/dispatch/${acceptTransferModal.id}/accept-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: acceptNotes.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to accept transfer');
      }

      showToast(data.message || 'Transfer accepted and stock added successfully!', 'success');
      setAcceptTransferModal(null);
      setAcceptNotes('');
      await Promise.all([fetchDispatches(true), refreshInboundTransfersCount()]);
    } catch (err) {
      console.error('Error accepting transfer:', err);
      showToast(err.message || 'Error accepting transfer', 'error');
    } finally {
      setAcceptingTransfer(false);
    }
  };

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

  // Open Edit Dispatch Modal (for Admin & Dispatch staff)
  const handleOpenEditDispatch = (dispatch) => {
    setEditDispatchModal(dispatch);
    setEditDispatchType(resolveDispatchType(dispatch));
    setEditVehicleNumber(dispatch.vehicle_number || '');
    setEditDestination(dispatch.destination || '');
    const origin = normalizePlant(dispatch.from_location || 'E41 G2');
    setEditFromLocation(origin);
    setEditDispatchDate(dispatch.dispatch_date || getTodayIST());
    setEditRemarks(cleanDispatchRemarks(dispatch.remarks || ''));

    // Co-loading status
    const isCoLoad = isCoLoadingDispatch(dispatch);
    setEditIsCoLoading(isCoLoad);
    const coStatus = resolveCoLoadingStatus(dispatch);
    setEditCoLoadingStatus(coStatus === 'not_applicable' ? (isCoLoad ? 'part_loaded' : 'not_applicable') : coStatus);
    const nextPlant = resolveNextLoadingPlant(dispatch) || (origin === 'E41 G2' ? 'C116' : (origin === 'C116' ? 'D4' : 'E41 G2'));
    setEditNextLoadingPlant(nextPlant);
    setEditSecondPlant(resolveSecondPlant(dispatch) || '');
    setEditThirdPlant(dispatch.third_plant || '');

    // Map existing line items
    const mappedItems = (dispatch.dispatch_items || []).map((di, idx) => {
      const plant = resolveItemLoadedPlant(di, dispatch);
      return {
        tempId: di.id || `item-${idx}-${Date.now()}`,
        id: di.id,
        model_id: di.model_id,
        model_name: di.cooler_models?.name || 'Cooler Model',
        model_code: di.cooler_models?.code || '',
        quantity: di.quantity,
        loaded_plant: plant,
      };
    });
    setEditItems(mappedItems);

    // Reset new item inputs
    setNewItemModelId('');
    setNewItemQty(1);
    const targetItemPlant = activePlant !== ALL_PLANTS_ID ? activePlant : (resolveNextLoadingPlant(dispatch) || origin);
    setNewItemPlant(targetItemPlant);
  };

  // Update item quantity
  const handleUpdateItemQty = (index, deltaOrVal) => {
    setEditItems((prev) => {
      const next = [...prev];
      const item = { ...next[index] };
      let newQty = typeof deltaOrVal === 'number' ? item.quantity + deltaOrVal : parseInt(deltaOrVal, 10);
      if (isNaN(newQty) || newQty < 1) newQty = 1;
      item.quantity = newQty;
      next[index] = item;
      return next;
    });
  };

  // Update item plant attribution
  const handleUpdateItemPlant = (index, newPlant) => {
    setEditItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], loaded_plant: normalizePlant(newPlant) };
      return next;
    });
  };

  // Remove item from edit list
  const handleRemoveItem = (index) => {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Add new cooler model to edit list
  const handleAddEditItem = () => {
    if (!newItemModelId) {
      showToast('Please select a cooler model to add', 'warning');
      return;
    }
    const qty = parseInt(newItemQty, 10);
    if (!qty || qty <= 0) {
      showToast('Quantity must be at least 1', 'warning');
      return;
    }
    const selectedModel = availableModels.find((m) => m.id === newItemModelId);
    const targetPlant = normalizePlant(newItemPlant || editFromLocation || 'E41 G2');

    setEditItems((prev) => {
      const existingIdx = prev.findIndex(
        (it) => it.model_id === newItemModelId && it.loaded_plant === targetPlant
      );
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: next[existingIdx].quantity + qty,
        };
        return next;
      }
      return [
        ...prev,
        {
          tempId: `new-${Date.now()}`,
          model_id: newItemModelId,
          model_name: selectedModel?.name || 'Cooler Model',
          model_code: selectedModel?.code || '',
          quantity: qty,
          loaded_plant: targetPlant,
        },
      ];
    });

    setNewItemModelId('');
    setNewItemQty(1);
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

      const payload = {
        dispatch_type: editDispatchType,
        vehicle_number: vNum,
        destination: dest,
        from_location: editFromLocation.trim(),
        dispatch_date: editDispatchDate,
        remarks: editRemarks.trim(),
        is_coloading: editIsCoLoading,
        coloading_status: editIsCoLoading ? editCoLoadingStatus : 'not_applicable',
        next_loading_plant: (editIsCoLoading && editCoLoadingStatus === 'part_loaded') ? editNextLoadingPlant : null,
        second_plant: editSecondPlant || null,
        third_plant: editThirdPlant || null,
        items: editItems.map((it) => ({
          model_id: it.model_id,
          quantity: Number(it.quantity),
          loaded_plant: it.loaded_plant,
        })),
      };

      const res = await fetch(`/api/dispatch/${editDispatchModal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update dispatch');
      }

      showToast(`Dispatch ${vNum} & warehouse inventory updated successfully!`, 'success');
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
      const dType = resolveDispatchType(d);
      const itemsSummary = (d.dispatch_items || [])
        .map((it) => `${it.cooler_models?.code || 'Cooler'}: ${it.quantity} pcs`)
        .join(', ');
      return {
        'S.No': idx + 1,
        'Dispatch Date': d.dispatch_date || '',
        'Dispatch Category': dType === 'local' ? 'Local Dispatch (Other Plant)' : 'Party Dispatch',
        'Vehicle Number': d.vehicle_number || '',
        'Status': (d.status || '').toUpperCase(),
        'Destination': d.destination || '',
        'Origin Location': d.from_location || 'Jospo E41',
        'Total Quantity (pcs)': calculateTotalQty(d.dispatch_items),
        'Models Breakdown': itemsSummary,
        'Created By': d.employees?.name || 'Staff',
        'Remarks': cleanDispatchRemarks(d.remarks || ''),
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

  const isAdmin = employee?.role === 'admin' || isOwner;

  return (
    <AppShell allowedRoles={['admin', 'dispatch']}>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                {activePlant === ALL_PLANTS_ID ? 'Dispatches & Transfers (All Plants)' : `${activePlant} Dispatches & Transfers`}
              </h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                activePlant === ALL_PLANTS_ID
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
              }`}>
                {activePlant === ALL_PLANTS_ID ? '🌐 All Plants' : `🏭 ${activePlant}`}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-600">
              {activePlant === ALL_PLANTS_ID
                ? 'Overview of outward shipments and inter-plant transfers across all facilities.'
                : `Outward shipments and inbound stock transfers for ${activePlant} facility.`}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={() => {
                fetchDispatches(true);
                refreshInboundTransfersCount();
              }}
              disabled={refreshing || loading}
              className="btn-secondary text-sm inline-flex items-center space-x-1.5"
              title="Refresh dispatches and transfers"
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
            title={activePlant === ALL_PLANTS_ID ? 'Total Dispatches' : `${activePlant} Dispatches`}
            value={stats.total}
            icon="🚚"
            color="indigo"
            subtitle={activePlant === ALL_PLANTS_ID ? 'Across all plants' : `From ${activePlant} Plant`}
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

        {/* Incoming Co-Loading Vehicles Alert Banner */}
        {incomingCoLoadVehicles.length > 0 && (
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-500/10 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl">🚚</span>
                <div>
                  <h3 className="text-base font-extrabold text-amber-950 flex items-center space-x-2">
                    <span>Part-Loaded Vehicles Arriving for Co-Loading</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-500 text-white shadow-xs">
                      {incomingCoLoadVehicles.length} {incomingCoLoadVehicles.length === 1 ? 'Vehicle' : 'Vehicles'}
                    </span>
                  </h3>
                  <p className="text-xs text-amber-800">
                    {activePlant === ALL_PLANTS_ID
                      ? 'Partially loaded vehicles awaiting secondary loading at their designated next plant.'
                      : `These vehicles are arriving at ${activePlant} to load remaining items for party dispatch.`}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {incomingCoLoadVehicles.map((v) => {
                const originPlant = normalizePlant(v.from_location);
                const nextPlant = resolveNextLoadingPlant(v) || 'Second Plant';
                const loadedQty = calculateTotalQty(v.dispatch_items);
                return (
                  <div
                    key={v.id}
                    className="bg-white/90 backdrop-blur-xs border border-amber-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-black text-sm bg-gray-100 px-2 py-0.5 rounded text-gray-900 border border-gray-200">
                          {v.vehicle_number}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                          ⏳ Part Loaded
                        </span>
                      </div>
                      <div className="text-xs space-y-1 text-gray-600 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Route:</span>
                          <span className="font-semibold text-gray-800 truncate max-w-[170px]" title={`${getDispatchLoadedPlants(v).join(' ➔ ')} ➔ ${nextPlant}`}>
                            {getDispatchLoadedPlants(v).join(' ➔ ')} ➔ {nextPlant}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Destination Party:</span>
                          <span className="font-bold text-gray-900 truncate max-w-[150px]">{v.destination}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Loaded Prior Stops:</span>
                          <span className="font-extrabold text-indigo-700">{loadedQty} pcs</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-amber-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setViewDetailsModal(v)}
                        className="text-xs text-gray-600 hover:text-gray-900 underline font-medium"
                      >
                        View Items
                      </button>
                      <button
                        type="button"
                        onClick={() => setCoLoadingModalData(v)}
                        className="btn-primary text-xs py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold inline-flex items-center space-x-1.5 shadow-sm"
                      >
                        <span>➕ Load Models</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Incoming Inbound Stock Transfers Alert Banner */}
        {pendingInboundTransfers.length > 0 && (
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-50 to-emerald-500/10 border-2 border-emerald-400 rounded-2xl p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div className="flex items-center space-x-2.5">
                <span className="text-2xl">📥</span>
                <div>
                  <h3 className="text-base font-extrabold text-emerald-950 flex items-center space-x-2">
                    <span>Incoming Stock Transfers Arriving at {activePlant !== ALL_PLANTS_ID ? activePlant : 'Plants'}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white shadow-xs animate-pulse">
                      {pendingInboundTransfers.length} {pendingInboundTransfers.length === 1 ? 'Shipment' : 'Shipments'} Pending
                    </span>
                  </h3>
                  <p className="text-xs text-emerald-800">
                    Inter-plant transfers in-transit. Inspect physical coolers and click &quot;Verify &amp; Accept Stock&quot; to credit coolers to inventory.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendingInboundTransfers.map((t) => {
                const origin = normalizePlant(t.from_location);
                const dest = resolveDestinationPlant(t) || activePlant;
                const totalQty = calculateTotalQty(t.dispatch_items);

                return (
                  <div
                    key={t.id}
                    className="bg-white/95 backdrop-blur-xs border border-emerald-200 rounded-xl p-3.5 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-black text-sm bg-gray-100 px-2 py-0.5 rounded text-gray-900 border border-gray-200">
                          {t.vehicle_number}
                        </span>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                          🚚 In Transit
                        </span>
                      </div>
                      <div className="text-xs space-y-1 text-gray-600 mb-3">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Route:</span>
                          <span className="font-semibold text-gray-800">
                            🏭 {origin} &rarr; 🏭 {dest}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Dispatch Date:</span>
                          <span className="font-medium text-gray-700">{t.dispatch_date}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Transfer Qty:</span>
                          <span className="font-extrabold text-emerald-700">{totalQty} coolers</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-emerald-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setViewDetailsModal(t)}
                        className="text-xs text-gray-600 hover:text-gray-900 underline font-medium"
                      >
                        View Items
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAcceptTransferModal(t);
                          setAcceptNotes('');
                        }}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-lg shadow-sm transition-all inline-flex items-center space-x-1"
                      >
                        <span>📥</span>
                        <span>Verify &amp; Accept Stock</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Tabs: Outward Dispatches vs Inbound Inter-Plant Transfers */}
        <div className="flex border-b border-gray-200 gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('outward')}
            className={`pb-3 px-3 text-sm font-bold border-b-2 flex items-center space-x-2 transition-all ${
              activeTab === 'outward'
                ? 'border-primary-600 text-primary-700 font-extrabold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="text-base">🚚</span>
            <span>Outward Dispatches ({filteredDispatches.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inbound')}
            className={`pb-3 px-3 text-sm font-bold border-b-2 flex items-center space-x-2 transition-all relative ${
              activeTab === 'inbound'
                ? 'border-primary-600 text-primary-700 font-extrabold'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="text-base">📥</span>
            <span>Inbound Plant Transfers</span>
            {inboundTransfersCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full text-xs font-black bg-rose-500 text-white shadow-sm animate-pulse">
                {inboundTransfersCount} Pending
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                {filteredInboundTransfers.length}
              </span>
            )}
          </button>
        </div>

        {/* OUTWARD DISPATCHES TAB */}
        {activeTab === 'outward' && (
          <>
            {/* Filters and Controls Card */}
            <div className="card space-y-4">
          {/* Status & Category Tabs & Search */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
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

              {/* Category Filter Tabs */}
              <div className="inline-flex p-1 bg-gray-100 rounded-xl space-x-1 overflow-x-auto">
                {[
                  { id: 'all', label: 'All Categories' },
                  { id: 'party', label: '🏢 Party' },
                  { id: 'local', label: '🏭 Local Plant' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTypeFilter(tab.id)}
                    className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      typeFilter === tab.id
                        ? 'bg-white text-primary-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
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
                placeholder="Search vehicle, destination, party, plant..."
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
              {(dateFrom || dateTo || searchTerm || statusFilter !== 'all' || typeFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setSearchTerm('');
                    setStatusFilter('all');
                    setTypeFilter('all');
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
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 font-medium">
                              {resolveDispatchType(dispatch) === 'local' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 w-fit">
                                  🏭 Local Plant
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 w-fit">
                                  🏢 Party
                                </span>
                              )}
                              {(() => {
                                const cl = getCoLoadingBadge(dispatch);
                                if (!cl) return null;
                                return (
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border w-fit ${cl.badgeClass}`}>
                                    <span>{cl.icon}</span>
                                    <span className="ml-1">{cl.shortLabel}</span>
                                  </span>
                                );
                              })()}
                              <div className="flex items-center space-x-1.5 text-xs">
                                <span className="text-gray-500">{dispatch.from_location}</span>
                                <span className="text-primary-600">→</span>
                                <span className="text-gray-900 font-semibold">{dispatch.destination}</span>
                              </div>
                            </div>
                            {cleanDispatchRemarks(dispatch.remarks) && (
                              <p className="text-xs text-gray-500 truncate max-w-xs mt-1">
                                Note: {cleanDispatchRemarks(dispatch.remarks)}
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
                              {/* Co-Loading action for secondary/tertiary plant */}
                              {dispatch.status === 'confirmed' &&
                                isCoLoadingDispatch(dispatch) && (
                                  resolveCoLoadingStatus(dispatch) === 'part_loaded' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCoLoadingTargetPlant(resolveNextLoadingPlant(dispatch));
                                        setCoLoadingModalData(dispatch);
                                      }}
                                      className="px-2.5 py-1 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-md transition-colors inline-flex items-center space-x-1 shadow-xs"
                                      title={`Complete secondary loading at ${resolveNextLoadingPlant(dispatch) || 'second plant'}`}
                                    >
                                      <span>➕ Load Models</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const target = activePlant !== ALL_PLANTS_ID ? activePlant : (dispatch.second_plant || 'D4');
                                        setCoLoadingTargetPlant(target);
                                        setCoLoadingModalData(dispatch);
                                      }}
                                      className="px-2 py-1 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors inline-flex items-center space-x-1"
                                      title="Edit models loaded at this plant or offload coolers"
                                    >
                                      <span>✏️ Edit {activePlant !== ALL_PLANTS_ID ? activePlant : 'Stop'} Load</span>
                                    </button>
                                  )
                                )}

                              {/* Inbound Transfer Action: If this shipment arrives at this plant */}
                              {dispatch.status === 'confirmed' &&
                                resolveDestinationPlant(dispatch) &&
                                (activePlant === ALL_PLANTS_ID || resolveDestinationPlant(dispatch) === activePlant) && (
                                  resolveTransferStatus(dispatch) === 'in_transit' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAcceptTransferModal(dispatch);
                                        setAcceptNotes('');
                                      }}
                                      className="px-2.5 py-1 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-md shadow-xs transition-all inline-flex items-center space-x-1"
                                      title={`Verify and accept stock into ${resolveDestinationPlant(dispatch)} inventory`}
                                    >
                                      <span>📥 Accept Stock</span>
                                    </button>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      ✓ Received
                                    </span>
                                  )
                                )}

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

                              {/* Confirmed actions: Admin/Dispatch Edit & Admin Delete */}
                              {dispatch.status === 'confirmed' && (isAdmin || employee?.role === 'dispatch') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDispatch(dispatch)}
                                    className="px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-200 inline-flex items-center space-x-1"
                                    title="Edit dispatch details or loaded items"
                                  >
                                    <span>✏️</span>
                                    <span>Edit</span>
                                  </button>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => setDeleteModalData(dispatch)}
                                      className="px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors border border-rose-200 inline-flex items-center space-x-1"
                                      title="Delete Confirmed Dispatch"
                                    >
                                      <span>🗑️</span>
                                      <span>Delete Dispatch</span>
                                    </button>
                                  )}
                                </>
                              )}

                              {/* Cancelled actions: Admin/Dispatch Edit & Admin Delete */}
                              {dispatch.status === 'cancelled' && (isAdmin || employee?.role === 'dispatch') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDispatch(dispatch)}
                                    className="px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-200 inline-flex items-center space-x-1"
                                    title="Edit dispatch details"
                                  >
                                    <span>✏️</span>
                                    <span>Edit</span>
                                  </button>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => setDeleteModalData(dispatch)}
                                      className="px-2.5 py-1 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors border border-rose-200 inline-flex items-center space-x-1"
                                      title="Delete Cancelled Dispatch"
                                    >
                                      <span>🗑️</span>
                                      <span>Delete Dispatch</span>
                                    </button>
                                  )}
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

                                {isCoLoadingDispatch(dispatch) && (
                                  <div className="mb-3 p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-xs flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-bold text-amber-900">Multi-Plant Route:</span>
                                      <span className="font-semibold text-gray-800">
                                        {formatCoLoadingRoute(dispatch)}
                                      </span>
                                    </div>
                                    <div>
                                      {resolveCoLoadingStatus(dispatch) === 'part_loaded' ? (
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                                          ⏳ Part Loaded
                                        </span>
                                      ) : (
                                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                          ✅ Fully Loaded
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}

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
                                          <th className="py-1.5 px-3 font-semibold uppercase">Loaded At Plant</th>
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
                                            <td className="py-2 px-3">
                                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-gray-100 text-gray-800 border border-gray-200">
                                                🏭 {resolveItemLoadedPlant(item, dispatch)}
                                              </span>
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
      </>
    )}

    {/* INBOUND PLANT TRANSFERS TAB */}
    {activeTab === 'inbound' && (
      <div className="card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
              <span>📥 Incoming Stock Transfers from Other Plants</span>
              {activePlant !== ALL_PLANTS_ID && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary-50 text-primary-700">
                  Destination: {activePlant}
                </span>
              )}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              When other plants dispatch material to this plant, inspect the physical shipment and click &quot;Verify &amp; Accept Stock&quot; to credit it to local inventory.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchDispatches(true)}
            disabled={refreshing}
            className="btn-secondary text-xs py-1.5 px-3 self-start sm:self-auto inline-flex items-center space-x-1"
          >
            <span>🔄</span>
            <span>{refreshing ? 'Refreshing...' : 'Refresh Inbound'}</span>
          </button>
        </div>

        {/* Inbound List */}
        {filteredInboundTransfers.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center text-2xl text-gray-400">
              📥
            </div>
            <h3 className="text-sm font-bold text-gray-900">No Inbound Transfers</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              {activePlant === ALL_PLANTS_ID
                ? 'No inter-plant transfers found in the system.'
                : `No pending or received inter-plant transfers dispatched to ${activePlant}.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3.5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Transfer / Date
                  </th>
                  <th className="px-3.5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Origin &rarr; Destination
                  </th>
                  <th className="px-3.5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Vehicle
                  </th>
                  <th className="px-3.5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Material Summary
                  </th>
                  <th className="px-3.5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Transfer Status
                  </th>
                  <th className="px-3.5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredInboundTransfers.map((dispatch) => {
                  const origin = normalizePlant(dispatch.from_location);
                  const dest = resolveDestinationPlant(dispatch);
                  const tStatus = resolveTransferStatus(dispatch);
                  const totalQty = calculateTotalQty(dispatch.dispatch_items);
                  const isAccepted = Boolean(dispatch.received_at || tStatus === 'received');
                  const isPending = !isAccepted && dispatch.status === 'confirmed';

                  return (
                    <tr key={dispatch.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <div className="font-mono text-xs font-bold text-gray-900">
                          {dispatch.dispatch_date || 'N/A'}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          Created by {dispatch.employees?.name || 'Staff'}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-1.5 text-xs font-bold">
                          <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                            🏭 {origin}
                          </span>
                          <span className="text-gray-400">&rarr;</span>
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200">
                            🏭 {dest}
                          </span>
                        </div>
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap font-mono text-xs font-bold text-gray-800">
                        {dispatch.vehicle_number}
                      </td>
                      <td className="px-3.5 py-3 text-xs">
                        <div className="font-bold text-gray-900">{totalQty} coolers</div>
                        <div className="text-[11px] text-gray-500 truncate max-w-xs">
                          {(dispatch.dispatch_items || [])
                            .map((i) => `${i.cooler_models?.code || 'Cooler'}: ${i.quantity}`)
                            .join(', ')}
                        </div>
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        {isPending ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                            🚚 In Transit (Pending Acceptance)
                          </span>
                        ) : isAccepted ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              ✓ Stock Accepted &amp; Added
                            </span>
                            {dispatch.received_at && (
                              <div className="text-[10px] text-gray-400">
                                {new Date(dispatch.received_at).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
                            {dispatch.status || 'Draft'}
                          </span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 whitespace-nowrap text-right text-xs font-medium space-x-2">
                        <button
                          type="button"
                          onClick={() => setChallanModalDispatch(dispatch)}
                          className="px-2.5 py-1 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          🖨️ Challan
                        </button>
                        {isPending ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAcceptTransferModal(dispatch);
                              setAcceptNotes('');
                            }}
                            className="px-3 py-1 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-lg shadow-sm transition-all"
                          >
                            📥 Verify &amp; Accept Stock
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setViewDetailsModal(dispatch)}
                            className="px-2.5 py-1 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                          >
                            View Details
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}

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

        {/* Modal: Edit Dispatch (Admin & Dispatch Staff) */}
        {editDispatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="card max-w-3xl w-full p-6 shadow-2xl animate-scaleUp max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4 sticky top-0 bg-white z-10">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-lg font-bold">
                    ✏️
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-base font-bold text-gray-900">
                        Edit Dispatch {editDispatchModal.vehicle_number}
                      </h3>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        editDispatchModal.status === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : editDispatchModal.status === 'cancelled'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {editDispatchModal.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Origin: <span className="font-semibold text-gray-700">{editFromLocation}</span> • Update vehicle details, adjust loaded coolers, or edit routing
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditDispatchModal(null)}
                  className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveDispatchEdit} className="space-y-5 text-xs">
                {/* Section 1: Vehicle & Route Header */}
                <div className="bg-gray-50/70 p-3.5 rounded-xl border border-gray-200/80 space-y-3">
                  <h4 className="font-bold text-gray-800 text-xs flex items-center space-x-1.5">
                    <span>🚛</span>
                    <span>Vehicle &amp; Dispatch Information</span>
                  </h4>

                  {/* Dispatch Category Selector */}
                  <div>
                    <label className="label text-[11px] mb-1 font-semibold text-gray-700">Dispatch Category <span className="text-red-500">*</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditDispatchType('party')}
                        className={`p-2 rounded-xl border text-left text-xs transition-all flex items-center space-x-2 ${
                          editDispatchType === 'party'
                            ? 'border-blue-500 bg-blue-50 text-blue-900 font-bold ring-1 ring-blue-500'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-base">🏢</span>
                        <div>
                          <div className="font-semibold text-gray-900">Party Dispatch</div>
                          <div className="text-[10px] font-normal text-gray-500">Commercial sale to party / dealer</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditDispatchType('local')}
                        className={`p-2 rounded-xl border text-left text-xs transition-all flex items-center space-x-2 ${
                          editDispatchType === 'local'
                            ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold ring-1 ring-amber-500'
                            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-base">🏭</span>
                        <div>
                          <div className="font-semibold text-gray-900">Local Dispatch</div>
                          <div className="text-[10px] font-normal text-gray-500">Internal transfer between plants</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label text-[11px]">Vehicle Number <span className="text-red-500">*</span></label>
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
                      <label className="label text-[11px]">
                        {editDispatchType === 'local' ? 'Destination Plant' : 'Destination Party / City'}{' '}
                        <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editDestination}
                        onChange={(e) => setEditDestination(e.target.value)}
                        placeholder={editDispatchType === 'local' ? 'e.g. Jospo Plant 2, Unit 2' : 'e.g. Jaipur Depot, Client Warehouse'}
                        className="input-field text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label text-[11px]">Origin Location / Plant</label>
                      <select
                        value={editFromLocation}
                        onChange={(e) => setEditFromLocation(e.target.value)}
                        className="input-field text-xs font-medium"
                      >
                        {PLANTS.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="label text-[11px]">Dispatch Date <span className="text-red-500">*</span></label>
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
                    <label className="label text-[11px]">Remarks / Driver Notes</label>
                    <input
                      type="text"
                      value={editRemarks}
                      onChange={(e) => setEditRemarks(e.target.value)}
                      placeholder="Driver name, contact number, e-way bill number, notes..."
                      className="input-field text-xs"
                    />
                  </div>
                </div>

                {/* Section 2: Multi-Plant Co-Loading & Routing (Accidental Confirmation Fix) */}
                <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-gray-900 text-xs flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editIsCoLoading}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEditIsCoLoading(checked);
                          if (checked && editCoLoadingStatus === 'not_applicable') {
                            setEditCoLoadingStatus('part_loaded');
                          }
                        }}
                        className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
                      />
                      <span>🔄 Multi-Plant Co-Loading (Shared Vehicle Route)</span>
                    </label>
                    {editIsCoLoading && (
                      <span className="text-[11px] font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                        E41 ➔ C116 ➔ D4 Route
                      </span>
                    )}
                  </div>

                  {editIsCoLoading && (
                    <div className="space-y-3 pt-1 border-t border-amber-200/60 animate-fadeIn">
                      <div>
                        <label className="label text-[11px] font-semibold text-gray-700">Vehicle Loading &amp; Route Status</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => setEditCoLoadingStatus('part_loaded')}
                            className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-start space-x-2.5 ${
                              editCoLoadingStatus === 'part_loaded'
                                ? 'border-amber-500 bg-amber-100/70 text-amber-950 font-bold ring-1 ring-amber-500'
                                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span className="text-base mt-0.5">⏳</span>
                            <div>
                              <div className="font-bold">Part-Loaded (Send to Next Plant)</div>
                              <div className="text-[10px] font-normal text-amber-800">Vehicle still has more coolers to load at another plant</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditCoLoadingStatus('fully_loaded')}
                            className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-start space-x-2.5 ${
                              editCoLoadingStatus === 'fully_loaded'
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-500'
                                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <span className="text-base mt-0.5">✅</span>
                            <div>
                              <div className="font-bold">Fully Loaded (Dispatched)</div>
                              <div className="text-[10px] font-normal text-emerald-800">All coolers loaded. Vehicle heading to customer destination</div>
                            </div>
                          </button>
                        </div>
                      </div>

                      {editCoLoadingStatus === 'part_loaded' && (
                        <div className="bg-amber-100/60 p-3 rounded-lg border border-amber-300 space-y-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-base">📍</span>
                            <span className="font-bold text-amber-950 text-xs">Next Loading Stop / Plant:</span>
                            <select
                              value={editNextLoadingPlant}
                              onChange={(e) => setEditNextLoadingPlant(e.target.value)}
                              className="input-field text-xs py-1 px-2.5 font-bold bg-white max-w-xs"
                            >
                              {PLANTS.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                              ))}
                            </select>
                          </div>
                          <p className="text-[11px] text-amber-900 leading-relaxed">
                            💡 <strong>Accidentally confirmed vehicle or plan changed?</strong> Setting this status to <em>Part-Loaded</em> with Next Plant <strong>{editNextLoadingPlant}</strong> will immediately reopen the trip and send this vehicle into {editNextLoadingPlant}&apos;s incoming dispatch queue with the &ldquo;➕ Load Models&rdquo; button enabled!
                          </p>
                        </div>
                      )}

                      {editCoLoadingStatus === 'fully_loaded' && (
                        <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 text-emerald-900 text-[11px]">
                          ✓ Vehicle is fully loaded across all plants and dispatched to final destination.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Section 3: Coolers Loaded on Vehicle (Item Editor & Live Inventory Sync) */}
                <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-gray-900 text-xs flex items-center space-x-1.5">
                      <span>📦</span>
                      <span>Coolers Loaded on Vehicle ({editItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0)} Total)</span>
                    </h4>
                    <span className="text-[10px] font-medium text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                      Live Warehouse Inventory Sync
                    </span>
                  </div>

                  <p className="text-[11px] text-blue-900 leading-relaxed bg-blue-100/60 p-2 rounded-lg border border-blue-200/80">
                    🔄 <strong>Stock Synchronization:</strong> If you reduce quantity or remove an item, coolers are automatically returned to that plant&apos;s warehouse inventory. If you add or increase coolers, stock is verified and deducted from that plant.
                  </p>

                  {/* Plant Subtotal Bar */}
                  {(() => {
                    const plantCounts = editItems.reduce((acc, it) => {
                      const p = it.loaded_plant || 'E41 G2';
                      acc[p] = (acc[p] || 0) + Number(it.quantity || 0);
                      return acc;
                    }, {});
                    const totalQty = editItems.reduce((sum, it) => sum + Number(it.quantity || 0), 0);
                    return (
                      <div className="flex flex-wrap items-center gap-2 text-xs bg-white border border-gray-200 rounded-lg p-2.5">
                        <span className="font-semibold text-gray-700">Vehicle Breakdown:</span>
                        {Object.entries(plantCounts).map(([plantName, count]) => (
                          <span
                            key={plantName}
                            className="inline-flex items-center px-2 py-0.5 rounded font-mono font-bold bg-gray-100 border border-gray-300 text-gray-800"
                          >
                            🏭 {plantName}: {count} pcs
                          </span>
                        ))}
                        <span className="ml-auto font-bold text-primary-700">
                          Total on Truck: {totalQty} coolers
                        </span>
                      </div>
                    );
                  })()}

                  {/* Items List Table */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
                    {editItems.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-xs">
                        No coolers currently recorded on vehicle. Add coolers below.
                      </div>
                    ) : (
                      <table className="min-w-full divide-y divide-gray-200 text-xs">
                        <thead className="bg-gray-50 text-gray-600 font-semibold">
                          <tr>
                            <th className="px-3 py-2 text-left">Cooler Model</th>
                            <th className="px-3 py-2 text-left">Loaded At Plant</th>
                            <th className="px-3 py-2 text-center w-36">Quantity</th>
                            <th className="px-3 py-2 text-right w-16">Remove</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {editItems.map((item, idx) => (
                            <tr key={item.tempId || idx} className="hover:bg-gray-50/60 transition-colors">
                              <td className="px-3 py-2.5">
                                <div className="font-bold text-gray-900">{item.model_name}</div>
                                <div className="text-[10px] font-mono text-gray-500">{item.model_code || item.model_id}</div>
                              </td>
                              <td className="px-3 py-2.5">
                                <select
                                  value={item.loaded_plant}
                                  onChange={(e) => handleUpdateItemPlant(idx, e.target.value)}
                                  className="input-field text-xs py-1 px-2 font-semibold bg-gray-50"
                                >
                                  {PLANTS.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="inline-flex items-center space-x-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQty(idx, -1)}
                                    className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center justify-center transition-colors"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => handleUpdateItemQty(idx, e.target.value)}
                                    className="w-16 input-field text-xs text-center font-bold py-1 px-1 font-mono"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQty(idx, 1)}
                                    className="w-6 h-6 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold flex items-center justify-center transition-colors"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="text-rose-600 hover:text-rose-800 p-1 rounded hover:bg-rose-50 transition-colors font-bold"
                                  title="Remove cooler from vehicle"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Add Cooler Row */}
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-200/90 space-y-2">
                    <div className="font-semibold text-gray-800 text-xs flex items-center space-x-1">
                      <span>➕</span>
                      <span>Add Cooler to Vehicle</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <div className="sm:col-span-5">
                        <select
                          value={newItemModelId}
                          onChange={(e) => setNewItemModelId(e.target.value)}
                          className="input-field text-xs font-medium"
                        >
                          <option value="">-- Select Cooler Model --</option>
                          {availableModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.code ? `[${m.code}] ` : ''}{m.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <select
                          value={newItemPlant}
                          onChange={(e) => setNewItemPlant(e.target.value)}
                          className="input-field text-xs font-medium"
                        >
                          {PLANTS.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min="1"
                          value={newItemQty}
                          onChange={(e) => setNewItemQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          placeholder="Qty"
                          className="input-field text-xs font-bold text-center"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          onClick={handleAddEditItem}
                          className="w-full btn-primary text-xs py-2 px-2 font-bold shadow-xs whitespace-nowrap"
                        >
                          + Add Item
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="text-gray-500 text-[11px]">
                    Vehicle: <span className="font-mono font-bold text-gray-800">{editVehicleNumber || '—'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
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
                      className="btn-primary text-xs py-2 px-5 font-bold shadow-md inline-flex items-center space-x-1.5"
                    >
                      {savingDispatchEdit ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Saving &amp; Syncing Stock...</span>
                        </>
                      ) : (
                        <>
                          <span>💾</span>
                          <span>Save &amp; Sync Changes</span>
                        </>
                      )}
                    </button>
                  </div>
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
                <div className="col-span-2 flex items-center justify-between pb-2 border-b border-gray-200">
                  <span className="text-gray-500 font-medium">Dispatch Category:</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                    resolveDispatchType(viewDetailsModal) === 'local'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-blue-100 text-blue-800 border border-blue-300'
                  }`}>
                    {resolveDispatchType(viewDetailsModal) === 'local' ? '🏭 Local Dispatch (Other Plant)' : '🏢 Party Dispatch'}
                  </span>
                </div>
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
                  <span className="text-gray-500 block">
                    {resolveDispatchType(viewDetailsModal) === 'local' ? 'Destination Plant:' : 'Destination:'}
                  </span>
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

              {cleanDispatchRemarks(viewDetailsModal.remarks) && (
                <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-900">
                  <span className="font-bold">Remarks:</span> {cleanDispatchRemarks(viewDetailsModal.remarks)}
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

              {/* Co-Loading Multi-Plant Route Summary */}
              {isCoLoadingDispatch(viewDetailsModal) && (
                <div className="mb-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-950">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold flex items-center space-x-1.5 text-amber-900">
                      <span>🚚</span>
                      <span>Multi-Plant Co-Loading Chain (साझा गाड़ी लोडिंग)</span>
                    </span>
                    {resolveCoLoadingStatus(viewDetailsModal) === 'part_loaded' ? (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-200 text-amber-900 border border-amber-300">
                        ⏳ Part Loaded (In Progress)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        ✅ Fully Loaded (All Stops Complete)
                      </span>
                    )}
                  </div>

                  <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200/60 mb-2">
                    <span className="text-gray-500 block text-[11px] font-semibold mb-1">
                      Multi-Stop Loading Route:
                    </span>
                    <div className="font-bold text-gray-900 flex flex-wrap items-center gap-1.5 text-[11px]">
                      {getDispatchLoadedPlants(viewDetailsModal).map((plantName, pIdx) => (
                        <React.Fragment key={plantName}>
                          <span className="bg-amber-100 border border-amber-200 px-2 py-0.5 rounded text-amber-900">
                            Stop {pIdx + 1}: 🏭 {plantName}
                          </span>
                          <span className="text-amber-600 font-bold">➔</span>
                        </React.Fragment>
                      ))}
                      {resolveCoLoadingStatus(viewDetailsModal) === 'part_loaded' && resolveNextLoadingPlant(viewDetailsModal) && (
                        <>
                          <span className="bg-orange-100 border border-orange-300 text-orange-900 px-2 py-0.5 rounded animate-pulse font-extrabold">
                            Next Stop: 🏭 {resolveNextLoadingPlant(viewDetailsModal)}
                          </span>
                          <span className="text-amber-600 font-bold">➔</span>
                        </>
                      )}
                      <span className="bg-blue-50 border border-blue-200 text-blue-900 px-2 py-0.5 rounded font-extrabold">
                        🏢 {viewDetailsModal.destination}
                      </span>
                    </div>
                  </div>

                  {resolveCoLoadingStatus(viewDetailsModal) === 'part_loaded' ? (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-amber-800 text-[11px]">
                        Arriving at {resolveNextLoadingPlant(viewDetailsModal) || 'Next Plant'} to continue loading.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const d = viewDetailsModal;
                          const nextP = resolveNextLoadingPlant(d);
                          setViewDetailsModal(null);
                          setCoLoadingTargetPlant(nextP);
                          setCoLoadingModalData(d);
                        }}
                        className="btn-primary text-xs py-1 px-3 bg-amber-600 hover:bg-amber-700 text-white font-bold"
                      >
                        ➕ Load Models Now
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-emerald-800 text-[11px]">
                        Vehicle fully loaded. Need to edit items loaded at secondary plant?
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const d = viewDetailsModal;
                          const target = activePlant !== ALL_PLANTS_ID ? activePlant : (d.second_plant || 'D4');
                          setViewDetailsModal(null);
                          setCoLoadingTargetPlant(target);
                          setCoLoadingModalData(d);
                        }}
                        className="btn-secondary text-xs py-1 px-3 text-indigo-700 font-bold border border-indigo-200 hover:bg-indigo-50"
                      >
                        ✏️ Edit {activePlant !== ALL_PLANTS_ID ? activePlant : 'Stop'} Load
                      </button>
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
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Loaded At</th>
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
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-800 border border-gray-200">
                            🏭 {resolveItemLoadedPlant(item, viewDetailsModal)}
                          </span>
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
                {(isAdmin || employee?.role === 'dispatch') && (
                  <button
                    type="button"
                    onClick={() => {
                      const d = viewDetailsModal;
                      setViewDetailsModal(null);
                      handleOpenEditDispatch(d);
                    }}
                    className="px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors inline-flex items-center space-x-1"
                  >
                    <span>✏️</span>
                    <span>Edit Dispatch &amp; Items</span>
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      const d = viewDetailsModal;
                      setViewDetailsModal(null);
                      setDeleteModalData(d);
                    }}
                    className="px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors"
                  >
                    🗑️ Delete Dispatch
                  </button>
                )}
                {/* Accept Inbound button in Details Modal */}
                {viewDetailsModal.status === 'confirmed' &&
                  resolveDestinationPlant(viewDetailsModal) &&
                  (activePlant === ALL_PLANTS_ID || resolveDestinationPlant(viewDetailsModal) === activePlant) &&
                  resolveTransferStatus(viewDetailsModal) === 'in_transit' && (
                    <button
                      type="button"
                      onClick={() => {
                        const d = viewDetailsModal;
                        setViewDetailsModal(null);
                        setAcceptTransferModal(d);
                        setAcceptNotes('');
                      }}
                      className="px-3.5 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-lg shadow-sm inline-flex items-center space-x-1.5"
                    >
                      <span>📥</span>
                      <span>Verify &amp; Accept Stock</span>
                    </button>
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

        {/* Modal: Verify & Accept Inbound Stock Transfer */}
        {acceptTransferModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="card max-w-lg w-full p-6 shadow-2xl animate-scaleUp">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl">
                  📥
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Verify &amp; Accept Stock Transfer</h3>
                  <p className="text-xs text-gray-500">Atomic Stock Addition to Local Inventory</p>
                </div>
              </div>

              <div className="bg-emerald-50/50 rounded-xl p-3.5 mb-4 border border-emerald-200 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Origin Plant:</span>
                  <span className="font-bold text-gray-900">🏭 {normalizePlant(acceptTransferModal.from_location)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Destination Plant (Receiving):</span>
                  <span className="font-bold text-emerald-800">🏭 {resolveDestinationPlant(acceptTransferModal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Vehicle Number:</span>
                  <span className="font-mono font-bold text-gray-900">{acceptTransferModal.vehicle_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Dispatch Date:</span>
                  <span className="font-semibold text-gray-900">{acceptTransferModal.dispatch_date}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-emerald-200/60">
                  <span className="text-gray-600 font-bold">Total Coolers to Add:</span>
                  <span className="font-extrabold text-emerald-700 text-sm">
                    +{calculateTotalQty(acceptTransferModal.dispatch_items)} pcs
                  </span>
                </div>
              </div>

              {/* Items Breakdown */}
              <div className="mb-4 max-h-48 overflow-y-auto rounded-lg border border-gray-200 text-xs">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 font-bold text-gray-500">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Model</th>
                      <th className="px-3 py-1.5 text-left">Code</th>
                      <th className="px-3 py-1.5 text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {acceptTransferModal.dispatch_items?.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td className="px-3 py-1.5 font-bold text-gray-800">{item.cooler_models?.name}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-500">{item.cooler_models?.code}</td>
                        <td className="px-3 py-1.5 text-right font-extrabold text-emerald-700">+{item.quantity} pcs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Inspection notes */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Inspection Notes (Optional)
                </label>
                <input
                  type="text"
                  value={acceptNotes}
                  onChange={(e) => setAcceptNotes(e.target.value)}
                  placeholder="e.g., Physical count verified, all items received in good condition"
                  className="input text-xs w-full"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 mb-5 leading-relaxed">
                ℹ️ Clicking <strong>&quot;Verify &amp; Add Stock&quot;</strong> will mark this transfer as received and immediately credit the cooler quantities to <strong>{resolveDestinationPlant(acceptTransferModal)}</strong> inventory.
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setAcceptTransferModal(null)}
                  disabled={acceptingTransfer}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAcceptTransfer}
                  disabled={acceptingTransfer}
                  className="btn-primary text-xs py-2 px-4 bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500 inline-flex items-center space-x-1.5"
                >
                  {acceptingTransfer ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Crediting Stock...</span>
                    </>
                  ) : (
                    <span>✓ Verify &amp; Add Stock</span>
                  )}
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

        {/* Modal: Secondary Plant Co-Loading Modal */}
        {coLoadingModalData && (
          <CoLoadingModal
            dispatch={coLoadingModalData}
            currentPlant={
              coLoadingTargetPlant ||
              resolveNextLoadingPlant(coLoadingModalData) ||
              (activePlant !== ALL_PLANTS_ID ? activePlant : (resolveSecondPlant(coLoadingModalData) || 'D4'))
            }
            onClose={() => {
              setCoLoadingModalData(null);
              setCoLoadingTargetPlant(null);
            }}
            onSuccess={async () => {
              setCoLoadingModalData(null);
              setCoLoadingTargetPlant(null);
              await fetchDispatches(true);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
