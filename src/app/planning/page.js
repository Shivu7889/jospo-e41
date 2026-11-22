'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatsCard from '@/components/StatsCard';
import SearchableSelect from '@/components/SearchableSelect';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { usePlant } from '@/contexts/PlantContext';
import { getTodayIST } from '@/lib/date';
import { normalizePlant, ALL_PLANTS_ID } from '@/lib/plants';

export default function PlanningPage() {
  const router = useRouter();
  const { employee } = useAuth();
  const { showToast } = useToast();
  const { activePlant, isOwner } = usePlant();

  const isOwnerOrAdmin = isOwner || employee?.role === 'owner' || employee?.role === 'admin';

  // Date Filter State
  const todayStr = useMemo(() => getTodayIST(), []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'loading' | 'completed'

  // Data States
  const [plans, setPlans] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableNotCreated, setTableNotCreated] = useState(false);

  // Modal State: Create / Edit Plan
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [savingPlan, setSavingPlan] = useState(false);

  // Form Fields
  const [formDate, setFormDate] = useState(todayStr);
  const [formPlant, setFormPlant] = useState(activePlant && activePlant !== ALL_PLANTS_ID ? activePlant : 'E41 G2');
  const [formVehicle, setFormVehicle] = useState('');
  const [formDestination, setFormDestination] = useState('');
  const [formDispatchType, setFormDispatchType] = useState('party'); // 'party' | 'local'
  const [formPriority, setFormPriority] = useState('normal'); // 'normal' | 'urgent' | 'high'
  const [formNotes, setFormNotes] = useState('');
  const [formDriverPhone, setFormDriverPhone] = useState('');
  const [formItems, setFormItems] = useState([{ model_id: '', planned_quantity: '' }]);

  // Delete / Cancel Confirmation Modal
  const [deletingPlan, setDeletingPlan] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Sync plant if activePlant changes
  useEffect(() => {
    if (activePlant && activePlant !== ALL_PLANTS_ID) {
      setFormPlant(activePlant);
    }
  }, [activePlant]);

  // Fetch Cooler Models Catalog for Dropdowns
  useEffect(() => {
    async function loadModels() {
      try {
        const res = await fetch('/api/models?active_only=true');
        const data = await res.json();
        if (data.success) {
          setModels(data.models || []);
        }
      } catch (err) {
        console.warn('Failed to load cooler models for planning dropdown:', err);
      }
    }
    loadModels();
  }, []);

  // Fetch Plans from API
  const fetchPlans = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const plantParam = activePlant === ALL_PLANTS_ID ? 'ALL' : encodeURIComponent(activePlant);
      const url = `/api/planning?date=${encodeURIComponent(selectedDate)}&plant=${plantParam}&status=${encodeURIComponent(statusFilter)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to load dispatch plans');
      }

      if (data.tableNotCreated) {
        setTableNotCreated(true);
        setPlans([]);
      } else {
        setTableNotCreated(false);
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error('Fetch planning error:', err);
      showToast(err.message || 'Error loading plans', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedDate, activePlant, statusFilter, showToast]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Overall Statistics
  const stats = useMemo(() => {
    let totalTrucks = plans.length;
    let totalUnits = 0;
    let totalLoadedUnits = 0;
    let completedTrucks = 0;
    let loadingTrucks = 0;
    let pendingTrucks = 0;

    plans.forEach((p) => {
      totalUnits += Number(p.total_planned_quantity || 0);
      totalLoadedUnits += Number(p.total_loaded_quantity || 0);
      if (p.status === 'completed') completedTrucks++;
      else if (p.status === 'loading') loadingTrucks++;
      else if (p.status === 'pending') pendingTrucks++;
    });

    return {
      totalTrucks,
      totalUnits,
      totalLoadedUnits,
      completedTrucks,
      loadingTrucks,
      pendingTrucks,
    };
  }, [plans]);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingPlanId(null);
    setFormDate(selectedDate);
    setFormPlant(activePlant && activePlant !== ALL_PLANTS_ID ? activePlant : 'E41 G2');
    setFormVehicle('');
    setFormDestination('');
    setFormDispatchType('party');
    setFormPriority('normal');
    setFormNotes('');
    setFormDriverPhone('');
    setFormItems([{ model_id: '', planned_quantity: '' }]);
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (plan) => {
    setEditingPlanId(plan.id);
    setFormDate(plan.plan_date || selectedDate);
    setFormPlant(plan.plant || 'E41 G2');
    setFormVehicle(plan.vehicle_number || '');
    setFormDestination(plan.destination || '');
    setFormDispatchType(plan.dispatch_type || 'party');
    setFormPriority(plan.priority || 'normal');
    setFormNotes(plan.notes || '');
    setFormDriverPhone(plan.driver_phone || '');

    const existingItems = (plan.dispatch_plan_items || []).map((it) => ({
      model_id: it.model_id,
      planned_quantity: String(it.planned_quantity || ''),
    }));

    setFormItems(existingItems.length > 0 ? existingItems : [{ model_id: '', planned_quantity: '' }]);
    setIsModalOpen(true);
  };

  // Add Item Row to Form
  const handleAddItemRow = () => {
    setFormItems((prev) => [...prev, { model_id: '', planned_quantity: '' }]);
  };

  // Remove Item Row from Form
  const handleRemoveItemRow = (index) => {
    setFormItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Update Item Row
  const handleUpdateItemRow = (index, field, value) => {
    setFormItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  // Save Plan (Create or Update)
  const handleSavePlan = async (e) => {
    e.preventDefault();

    const cleanVehicle = formVehicle.trim().toUpperCase();
    const cleanDest = formDestination.trim();

    if (!cleanVehicle) {
      showToast('Please enter a vehicle registration number.', 'warning');
      return;
    }
    if (!cleanDest) {
      showToast('Please provide a party name or destination.', 'warning');
      return;
    }

    const validItems = formItems.filter(
      (it) => it.model_id && Number(it.planned_quantity) > 0
    );

    if (validItems.length === 0) {
      showToast('Please add at least one cooler model with quantity > 0.', 'warning');
      return;
    }

    try {
      setSavingPlan(true);

      const payload = {
        plan_date: formDate,
        plant: formPlant,
        vehicle_number: cleanVehicle,
        destination: cleanDest,
        dispatch_type: formDispatchType,
        priority: formPriority,
        notes: formNotes,
        driver_phone: formDriverPhone,
        items: validItems,
      };

      let res;
      if (editingPlanId) {
        res = await fetch('/api/planning', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingPlanId, ...payload }),
        });
      } else {
        res = await fetch('/api/planning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to save dispatch plan');
      }

      showToast(
        editingPlanId
          ? `Plan for vehicle ${cleanVehicle} updated successfully!`
          : `Plan for vehicle ${cleanVehicle} created!`,
        'success'
      );

      setIsModalOpen(false);
      fetchPlans(true);
    } catch (err) {
      console.error('Save plan error:', err);
      showToast(err.message || 'Error saving plan', 'error');
    } finally {
      setSavingPlan(false);
    }
  };

  // Delete Plan
  const handleDeletePlan = async () => {
    if (!deletingPlan) return;

    try {
      setIsDeleting(true);
      const res = await fetch('/api/planning', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingPlan.id }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete plan');
      }

      showToast(`Plan for ${deletingPlan.vehicle_number} deleted.`, 'success');
      setDeletingPlan(null);
      fetchPlans(true);
    } catch (err) {
      console.error('Delete plan error:', err);
      showToast(err.message || 'Error deleting plan', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AppShell allowedRoles={['owner', 'admin', 'dispatch', 'production']}>
      <div className="space-y-6">
        {/* Top Header & Overview */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
          <div>
            <div className="flex items-center space-x-2.5">
              <span className="text-2xl">🗓️</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                Owner Dispatch Planning
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                {activePlant === ALL_PLANTS_ID ? 'All Plants' : `🏭 ${activePlant}`}
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-gray-500">
              Schedule vehicles, target model quantities, and track live loading progress against today&apos;s plan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isOwnerOrAdmin && (
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="btn-primary text-xs sm:text-sm py-2 px-4 inline-flex items-center space-x-2 shadow-sm font-bold"
              >
                <span>➕</span>
                <span>Add Dispatch Plan</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => fetchPlans(false)}
              disabled={loading}
              className="btn-secondary text-xs py-2 px-3 inline-flex items-center space-x-1"
              title="Refresh plans"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Database Migration Banner if table is missing in Supabase */}
        {tableNotCreated && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 sm:p-5 text-amber-900 shadow-sm animate-fadeIn">
            <div className="flex items-start space-x-3">
              <span className="text-2xl flex-shrink-0">⚠️</span>
              <div className="space-y-1">
                <h3 className="font-extrabold text-sm sm:text-base text-amber-950">
                  Database Table Setup Required in Supabase
                </h3>
                <p className="text-xs text-amber-800 leading-relaxed">
                  The <code className="font-mono bg-amber-200/70 px-1 py-0.5 rounded font-bold">dispatch_plans</code> table has not been created yet in your Supabase database.
                </p>
                <p className="text-xs text-amber-900 font-semibold pt-1">
                  👉 Go to your <strong>Supabase Dashboard → SQL Editor</strong> and run the file <code className="font-mono bg-amber-200/70 px-1.5 py-0.5 rounded font-bold">sql/add_dispatch_planning.sql</code> to activate database storage.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Date Pills & Status Tabs */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 bg-white p-3 rounded-2xl border border-gray-200 shadow-xs">
          {/* Date Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-500 pl-1">Plan Date:</span>
            <div className="inline-flex p-1 bg-gray-100 rounded-xl">
              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedDate === todayStr
                    ? 'bg-white text-indigo-700 shadow-xs border border-gray-200 font-extrabold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Today ({todayStr})
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(tomorrowStr)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedDate === tomorrowStr
                    ? 'bg-white text-indigo-700 shadow-xs border border-gray-200 font-extrabold'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Tomorrow
              </button>
            </div>

            <div className="flex items-center space-x-1.5">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="input-field text-xs py-1.5 px-2.5 w-auto bg-gray-50 font-medium"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1 overflow-x-auto">
            {[
              { id: 'all', label: 'All Plans' },
              { id: 'pending', label: '⏳ Pending' },
              { id: 'loading', label: '🔄 In Progress' },
              { id: 'completed', label: '✅ Completed' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  statusFilter === tab.id
                    ? 'bg-primary-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200/70 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <StatsCard
            title="Planned Trucks"
            value={stats.totalTrucks}
            icon="🚚"
            color="indigo"
            subtitle={`${stats.completedTrucks} completed`}
          />
          <StatsCard
            title="Planned Units"
            value={stats.totalUnits.toLocaleString()}
            icon="📦"
            color="blue"
            subtitle={`${stats.totalLoadedUnits.toLocaleString()} loaded`}
          />
          <StatsCard
            title="In Progress"
            value={stats.loadingTrucks}
            icon="🔄"
            color="amber"
            subtitle="Currently loading at dock"
          />
          <StatsCard
            title="Completed"
            value={stats.completedTrucks}
            icon="✅"
            color="green"
            subtitle={`${stats.pendingTrucks} trucks pending`}
          />
        </div>

        {/* Plans List / Cards */}
        {loading ? (
          <div className="card py-16 flex justify-center">
            <LoadingSpinner message="Fetching daily dispatch plans..." size="lg" />
          </div>
        ) : plans.length === 0 ? (
          <div className="card py-16 text-center text-gray-500 space-y-3">
            <div className="text-4xl">📋</div>
            <h3 className="font-bold text-gray-800 text-base">
              No dispatch plans for {selectedDate === todayStr ? 'Today' : selectedDate}
            </h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              Owner/Admin can add a dispatch plan specifying vehicle number, destination, and target cooler quantities.
            </p>
            {isOwnerOrAdmin && (
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="btn-primary text-xs py-2 px-4 inline-flex items-center space-x-1.5 font-bold shadow-xs mt-2"
              >
                <span>➕</span>
                <span>Create Plan for {selectedDate}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {plans.map((plan) => {
              const isUrgent = plan.priority === 'urgent' || plan.priority === 'high';
              const isDone = plan.status === 'completed';
              const isLoading = plan.status === 'loading';

              return (
                <div
                  key={plan.id}
                  className={`card p-5 border-2 transition-all hover:shadow-md space-y-4 ${
                    isUrgent
                      ? 'border-rose-300 bg-rose-50/20'
                      : isDone
                      ? 'border-emerald-200 bg-emerald-50/10'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-extrabold text-base sm:text-lg text-gray-900 bg-gray-100 px-2.5 py-0.5 rounded-lg border border-gray-300">
                          {plan.vehicle_number}
                        </span>
                        {isUrgent && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-600 text-white animate-pulse">
                            🚨 URGENT
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            isDone
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isLoading
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {isDone ? '✅ Completed' : isLoading ? '🔄 Loading' : '⏳ Pending'}
                        </span>
                        <span className="text-[11px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                          🏭 {plan.plant}
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center space-x-1.5 text-xs text-gray-700">
                        <span className="font-bold text-gray-900">{plan.destination}</span>
                        <span className="text-gray-400">•</span>
                        <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">
                          {plan.dispatch_type === 'local' ? 'Internal Transfer' : 'Party Dispatch'}
                        </span>
                      </div>
                    </div>

                    {/* Progress Badge */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-extrabold text-indigo-700">
                        {plan.total_loaded_quantity} / {plan.total_planned_quantity} units
                      </div>
                      <span className="text-[10px] text-gray-500">
                        {plan.completion_percent}% loaded
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          isDone ? 'bg-emerald-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${plan.completion_percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Model Items Checklist */}
                  <div className="space-y-2 bg-gray-50 p-3 rounded-xl border border-gray-200 text-xs">
                    <div className="font-bold text-gray-700 text-[11px] uppercase tracking-wider mb-1">
                      Planned Cooler Models:
                    </div>
                    {(plan.dispatch_plan_items || []).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-1 border-b border-gray-200/60 last:border-0"
                      >
                        <div className="flex items-center space-x-2 truncate pr-2">
                          <span className="font-mono font-bold text-gray-900 bg-white px-1.5 py-0.5 rounded border border-gray-200 text-[11px]">
                            {item.cooler_models?.code || 'MODEL'}
                          </span>
                          <span className="text-gray-700 truncate font-medium">
                            {item.cooler_models?.name}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <span className="font-bold text-gray-900">
                            {item.loaded_quantity} / {item.planned_quantity} pcs
                          </span>
                          {item.loaded_quantity >= item.planned_quantity ? (
                            <span className="text-emerald-600 font-bold text-xs">✅</span>
                          ) : (
                            <span className="text-amber-600 text-[11px] font-semibold">
                              (Need {item.planned_quantity - item.loaded_quantity})
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Driver & Notes if present */}
                  {(plan.driver_phone || plan.notes) && (
                    <div className="text-[11px] text-gray-600 bg-amber-50/50 p-2.5 rounded-lg border border-amber-100 flex flex-wrap gap-2 items-center">
                      {plan.driver_phone && (
                        <span>
                          📞 <strong>Driver:</strong> {plan.driver_phone}
                        </span>
                      )}
                      {plan.notes && (
                        <span>
                          📝 <strong>Note:</strong> {plan.notes}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center space-x-2">
                      {isOwnerOrAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(plan)}
                            className="text-xs text-indigo-700 hover:text-indigo-900 font-bold px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingPlan(plan)}
                            className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded hover:bg-rose-50 transition-colors"
                          >
                            🗑️ Delete
                          </button>
                        </>
                      )}
                    </div>

                    {/* Start Loading Button */}
                    <Link
                      href={`/dispatch/new?plan_id=${plan.id}&vehicle=${encodeURIComponent(
                        plan.vehicle_number
                      )}&destination=${encodeURIComponent(plan.destination)}&plant=${encodeURIComponent(
                        plan.plant
                      )}&type=${encodeURIComponent(plan.dispatch_type)}`}
                      className={`btn-primary text-xs py-1.5 px-3.5 inline-flex items-center space-x-1.5 font-bold shadow-xs ${
                        isDone
                          ? 'bg-gray-600 hover:bg-gray-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      <span>🚚</span>
                      <span>{isDone ? 'View Dispatch' : 'Start Loading Truck'}</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Create / Edit Dispatch Plan */}
        {isModalOpen && (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
            role="dialog"
            aria-modal="true"
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-2xl w-full p-5 sm:p-7 relative space-y-4 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">📋</span>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">
                      {editingPlanId ? 'Edit Dispatch Plan' : 'Schedule New Dispatch Plan'}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Specify vehicle, target party, and planned cooler models.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={savingPlan}
                  className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-1.5 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSavePlan} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Plan Date */}
                  <div>
                    <label className="label text-xs font-bold text-gray-700">
                      Dispatch Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="input-field text-xs bg-white font-medium"
                    />
                  </div>

                  {/* Manufacturing Plant */}
                  <div>
                    <label className="label text-xs font-bold text-gray-700">
                      Origin Plant <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formPlant}
                      onChange={(e) => setFormPlant(e.target.value)}
                      className="input-field text-xs font-bold bg-white"
                      required
                    >
                      <option value="E41 G2">🏭 E41 G2 Plant</option>
                      <option value="C116">🏭 C116 Plant</option>
                      <option value="D4">🏭 D4 Plant</option>
                    </select>
                  </div>

                  {/* Vehicle Number */}
                  <div>
                    <label className="label text-xs font-bold text-gray-700">
                      Vehicle Registration Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MP09 AB 1234"
                      value={formVehicle}
                      onChange={(e) => setFormVehicle(e.target.value.toUpperCase())}
                      className="input-field font-mono font-bold uppercase text-sm"
                    />
                  </div>

                  {/* Destination / Party Name */}
                  <div>
                    <label className="label text-xs font-bold text-gray-700">
                      Party Name / Destination <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Shree Ram Coolers, Indore"
                      value={formDestination}
                      onChange={(e) => setFormDestination(e.target.value)}
                      className="input-field text-sm font-semibold"
                    />
                  </div>

                  {/* Priority & Category */}
                  <div>
                    <label className="label text-xs font-bold text-gray-700">Priority Level</label>
                    <select
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value)}
                      className="input-field text-xs font-semibold bg-white"
                    >
                      <option value="normal">Normal Priority</option>
                      <option value="urgent">🚨 Urgent (Top Priority)</option>
                      <option value="high">High Priority</option>
                    </select>
                  </div>

                  <div>
                    <label className="label text-xs font-bold text-gray-700">Dispatch Category</label>
                    <select
                      value={formDispatchType}
                      onChange={(e) => setFormDispatchType(e.target.value)}
                      className="input-field text-xs font-semibold bg-white"
                    >
                      <option value="party">🏢 Party Dispatch (Customer)</option>
                      <option value="local">🏭 Local Transfer (Inter-Plant)</option>
                    </select>
                  </div>

                  {/* Driver Phone & Notes */}
                  <div>
                    <label className="label text-xs font-bold text-gray-700">Driver Phone (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      value={formDriverPhone}
                      onChange={(e) => setFormDriverPhone(e.target.value)}
                      className="input-field text-xs"
                    />
                  </div>

                  <div>
                    <label className="label text-xs font-bold text-gray-700">Instructions / Notes (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Send before 3 PM, check bill copy"
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="input-field text-xs"
                    />
                  </div>
                </div>

                {/* Model Rows */}
                <div className="pt-2 border-t border-gray-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
                      Planned Cooler Models & Quantities
                    </span>
                    <button
                      type="button"
                      onClick={handleAddItemRow}
                      className="text-xs text-indigo-700 hover:text-indigo-900 font-bold inline-flex items-center space-x-1"
                    >
                      <span>➕</span>
                      <span>Add Another Model</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {formItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="flex-1">
                          <SearchableSelect
                            options={models.map((m) => ({
                              id: m.id,
                              code: m.code,
                              name: `${m.name} (${m.code})`,
                            }))}
                            value={item.model_id}
                            onChange={(val) => handleUpdateItemRow(idx, 'model_id', val)}
                            placeholder="-- Select Cooler Model --"
                          />
                        </div>
                        <div className="w-24 sm:w-28 flex-shrink-0">
                          <input
                            type="number"
                            min="1"
                            required
                            placeholder="Qty"
                            value={item.planned_quantity}
                            onChange={(e) => handleUpdateItemRow(idx, 'planned_quantity', e.target.value)}
                            className="input-field text-xs py-2 text-center font-bold"
                          />
                        </div>
                        {formItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItemRow(idx)}
                            className="w-8 h-8 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center font-bold"
                            title="Remove row"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submit Actions */}
                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    disabled={savingPlan}
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingPlan}
                    className="btn-primary text-xs py-2 px-5 inline-flex items-center space-x-1.5 font-bold shadow-md"
                  >
                    {savingPlan ? (
                      <span>Saving Plan...</span>
                    ) : (
                      <span>💾 {editingPlanId ? 'Update Plan' : 'Save Dispatch Plan'}</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Delete Confirmation */}
        {deletingPlan && (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
            role="dialog"
            aria-modal="true"
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-sm w-full p-6 text-center space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-2xl mx-auto">
                🗑️
              </div>
              <h3 className="font-bold text-gray-900 text-base">
                Delete Plan for {deletingPlan.vehicle_number}?
              </h3>
              <p className="text-xs text-gray-500">
                This will remove the scheduled plan for {deletingPlan.destination}. This action cannot be undone.
              </p>
              <div className="flex items-center justify-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeletingPlan(null)}
                  disabled={isDeleting}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeletePlan}
                  disabled={isDeleting}
                  className="btn-danger text-xs py-2 px-4 font-bold shadow-sm"
                >
                  {isDeleting ? 'Deleting...' : 'Yes, Delete Plan'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
