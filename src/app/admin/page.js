'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatsCard from '@/components/StatsCard';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getSupabase } from '@/lib/supabase';
import { usePlant } from '@/contexts/PlantContext';
import {
  PLANTS,
  ALL_PLANTS_ID,
  DEFAULT_PLANT_ID,
  getPlantMeta,
} from '@/lib/plants';

export default function AdminPage() {
  const { employee, user } = useAuth();
  const { showToast } = useToast();
  const { activePlant, isOwner } = usePlant();
  const supabase = getSupabase();

  // Active section tab: 'thekedars' | 'users' | 'adjustments' | 'system'
  const [activeSection, setActiveSection] = useState('thekedars');

  // Loading states
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingModels, setLoadingModels] = useState(true);
  const [loadingAdjustments, setLoadingAdjustments] = useState(true);
  const [submittingUser, setSubmittingUser] = useState(false);
  const [submittingAdjustment, setSubmittingAdjustment] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(null); // id of employee being updated

  // Plant state for user creation and stock adjustment
  const [newUserPlant, setNewUserPlant] = useState(DEFAULT_PLANT_ID);
  const [adjustmentPlant, setAdjustmentPlant] = useState(DEFAULT_PLANT_ID);

  // Thekedar (Contractor) Management State
  const [thekedarsList, setThekedarsList] = useState([]);
  const [loadingThekedars, setLoadingThekedars] = useState(true);
  const [newThekedarName, setNewThekedarName] = useState('');
  const [submittingThekedar, setSubmittingThekedar] = useState(false);

  // Read URL query parameters on initial mount (e.g. /admin?section=thekedars)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const sec = params.get('section');
      if (sec === 'thekedars' || sec === 'users' || sec === 'adjustments' || sec === 'system') {
        setActiveSection(sec);
      }
    }
  }, []);

  // Fetch Thekedars list
  const fetchThekedars = useCallback(async () => {
    try {
      setLoadingThekedars(true);
      const res = await fetch('/api/contractors');
      const data = await res.json();
      if (res.ok && data.contractors) {
        setThekedarsList(data.contractors);
      }
    } catch (err) {
      console.error('Error fetching contractors:', err);
    } finally {
      setLoadingThekedars(false);
    }
  }, []);

  useEffect(() => {
    fetchThekedars();
  }, [fetchThekedars]);

  // Admin add Thekedar
  const handleAddThekedar = async (e) => {
    if (e) e.preventDefault();
    const clean = newThekedarName.trim();
    if (!clean) {
      showToast('Please enter a contractor / Thekedar name', 'warning');
      return;
    }
    try {
      setSubmittingThekedar(true);
      const res = await fetch('/api/contractors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add Thekedar');

      setThekedarsList((prev) => Array.from(new Set([...prev, clean])));
      setNewThekedarName('');
      showToast(`Added Thekedar: ${clean}`, 'success');
    } catch (err) {
      console.error('Error adding contractor:', err);
      showToast(err.message || 'Error adding contractor', 'error');
    } finally {
      setSubmittingThekedar(false);
    }
  };

  // Admin remove Thekedar
  const handleRemoveThekedar = async (nameToRemove) => {
    if (!window.confirm(`Are you sure you want to remove "${nameToRemove}" from active Thekedars? Operators will no longer be able to select this contractor for new production.`)) {
      return;
    }
    try {
      setSubmittingThekedar(true);
      const res = await fetch(`/api/contractors?name=${encodeURIComponent(nameToRemove)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove Thekedar');

      setThekedarsList((prev) => prev.filter((t) => t !== nameToRemove));
      showToast(`Removed Thekedar: ${nameToRemove}`, 'success');
    } catch (err) {
      console.error('Error removing contractor:', err);
      showToast(err.message || 'Error removing contractor', 'error');
    } finally {
      setSubmittingThekedar(false);
    }
  };

  // Data states
  const [employees, setEmployees] = useState([]);
  const [models, setModels] = useState([]);
  const [stockMap, setStockMap] = useState({});
  const [recentAdjustments, setRecentAdjustments] = useState([]);

  // New Employee Form State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [creationMode, setCreationMode] = useState('auto'); // 'auto' | 'manual'
  const [newUserId, setNewUserId] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('production');

  // Stock Adjustment Form State
  const [selectedModelId, setSelectedModelId] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('add'); // 'add' | 'deduct'
  const [adjustmentQuantity, setAdjustmentQuantity] = useState(1);
  const [adjustmentReason, setAdjustmentReason] = useState('');

  // Confirmation Modal for Adjustment
  const [showConfirmAdjustmentModal, setShowConfirmAdjustmentModal] = useState(false);

  // System Diagnostics State
  const [dbStatus, setDbStatus] = useState('checking'); // 'checking' | 'connected' | 'error'
  const [dbLatency, setDbLatency] = useState(null);

  // 1. Fetch Employees
  const fetchEmployees = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmployees(data || []);
    } catch (err) {
      console.error('Error fetching employees:', err);
      showToast(err.message || 'Failed to load employees', 'error');
    } finally {
      setLoadingUsers(false);
    }
  }, [supabase, showToast]);

  // 2. Fetch Models & Current Stock
  const fetchModelsAndStock = useCallback(async () => {
    try {
      setLoadingModels(true);
      const { data: modelsData, error: modelsError } = await supabase
        .from('cooler_models')
        .select('*')
        .order('name', { ascending: true });

      if (modelsError) throw modelsError;
      setModels(modelsData || []);

      const { data: stockData, error: stockError } = await supabase
        .from('current_stock')
        .select('*');

      if (!stockError && stockData) {
        const sm = {};
        stockData.forEach((s) => {
          sm[s.model_id] = s.current_stock;
        });
        setStockMap(sm);
      }
    } catch (err) {
      console.error('Error fetching models:', err);
    } finally {
      setLoadingModels(false);
    }
  }, [supabase]);

  // 3. Fetch Recent Stock Adjustments
  const fetchRecentAdjustments = useCallback(async () => {
    try {
      setLoadingAdjustments(true);
      const { data, error } = await supabase
        .from('stock_transactions')
        .select(`
          id,
          quantity,
          transaction_type,
          notes,
          created_at,
          cooler_models (
            id,
            name,
            code
          ),
          employees (
            id,
            name
          )
        `)
        .eq('transaction_type', 'adjustment')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setRecentAdjustments(data || []);
    } catch (err) {
      console.error('Error fetching adjustments:', err);
    } finally {
      setLoadingAdjustments(false);
    }
  }, [supabase]);

  // 4. Test Database Connection & Latency
  const checkDatabaseHealth = useCallback(async () => {
    try {
      setDbStatus('checking');
      const start = performance.now();
      const { error } = await supabase.from('cooler_models').select('id').limit(1);
      const elapsed = Math.round(performance.now() - start);

      if (error) throw error;
      setDbStatus('connected');
      setDbLatency(elapsed);
    } catch (err) {
      setDbStatus('error');
      setDbLatency(null);
    }
  }, [supabase]);

  useEffect(() => {
    fetchEmployees();
    fetchModelsAndStock();
    fetchRecentAdjustments();
    checkDatabaseHealth();
  }, [fetchEmployees, fetchModelsAndStock, fetchRecentAdjustments, checkDatabaseHealth]);

  // Handle Add Employee Submit
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) {
      showToast('Name and email are required.', 'warning');
      return;
    }

    const payload = {
      name: newUserName.trim(),
      email: newUserEmail.trim(),
      role: newUserRole,
      plant: newUserPlant,
      is_active: true,
    };

    if (creationMode === 'auto') {
      if (!newUserPassword || newUserPassword.length < 6) {
        showToast('Password must be at least 6 characters long.', 'warning');
        return;
      }
      payload.password = newUserPassword;
    } else {
      if (!newUserId.trim()) {
        showToast('Please provide a valid Supabase Auth User ID (UUID).', 'warning');
        return;
      }
      payload.id = newUserId.trim();
    }

    try {
      setSubmittingUser(true);

      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to create employee');
      }

      showToast(`Employee ${newUserName} added successfully!`, 'success');
      setShowAddUserModal(false);
      setNewUserId('');
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('production');
      setNewUserPlant(DEFAULT_PLANT_ID);
      await fetchEmployees();
    } catch (err) {
      console.error('Error adding employee:', err);
      showToast(err.message || 'Error adding employee', 'error');
    } finally {
      setSubmittingUser(false);
    }
  };

  // Handle Toggle Active/Inactive
  const handleToggleActive = async (emp) => {
    if (emp.id === employee?.id) {
      showToast('You cannot deactivate your own account.', 'warning');
      return;
    }

    try {
      setActionInProgress(emp.id);
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: emp.id,
          is_active: !emp.is_active,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update employee status');

      showToast(
        `Employee ${emp.name} marked as ${!emp.is_active ? 'Active' : 'Inactive'}`,
        'success'
      );
      await fetchEmployees();
    } catch (err) {
      console.error('Error toggling employee status:', err);
      showToast(err.message || 'Failed to update employee', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Role Change
  const handleChangeRole = async (emp, newRole) => {
    if (emp.id === employee?.id && newRole !== 'admin' && newRole !== 'owner') {
      showToast('You cannot remove admin/owner privileges from your own account.', 'warning');
      return;
    }

    try {
      setActionInProgress(emp.id);
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: emp.id,
          role: newRole,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update employee role');

      showToast(`Role for ${emp.name} updated to ${newRole}`, 'success');
      await fetchEmployees();
    } catch (err) {
      console.error('Error updating role:', err);
      showToast(err.message || 'Failed to update role', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Plant Change
  const handleChangePlant = async (emp, newPlant) => {
    try {
      setActionInProgress(emp.id);
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: emp.id,
          plant: newPlant,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update employee plant');

      showToast(`Assigned ${emp.name} to ${newPlant}`, 'success');
      await fetchEmployees();
    } catch (err) {
      console.error('Error updating plant assignment:', err);
      showToast(err.message || 'Failed to update plant assignment', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Stock Adjustment Submit
  const handlePerformStockAdjustment = async () => {
    if (!selectedModelId) {
      showToast('Please select a cooler model to adjust.', 'warning');
      return;
    }
    const qty = parseInt(adjustmentQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast('Quantity must be a positive number.', 'warning');
      return;
    }
    if (!adjustmentReason.trim()) {
      showToast('Audit reason is required for stock adjustments.', 'warning');
      return;
    }
    if (!employee?.id) {
      showToast('Admin employee profile required to adjust stock.', 'error');
      return;
    }

    try {
      setSubmittingAdjustment(true);

      const netDelta = adjustmentType === 'add' ? qty : -qty;
      const model = models.find((m) => m.id === selectedModelId);
      const currentHolding = stockMap[selectedModelId] ?? 0;

      // Prevent negative stock balance on deduction
      if (adjustmentType === 'deduct' && currentHolding + netDelta < 0) {
        showToast(
          `Cannot deduct ${qty} units. Current stock is only ${currentHolding} units.`,
          'error'
        );
        setShowConfirmAdjustmentModal(false);
        return;
      }

      // Insert audited transaction (dual-mode: native plant column with fallback to notes)
      const auditNotes = `[Plant: ${adjustmentPlant}] Emergency Adjustment (${adjustmentType.toUpperCase()}): ${adjustmentReason.trim()}`;
      let { error: insertError } = await supabase.from('stock_transactions').insert({
        model_id: selectedModelId,
        transaction_type: 'adjustment',
        quantity: netDelta,
        employee_id: employee.id,
        plant: adjustmentPlant,
        notes: auditNotes,
      });

      if (insertError && (insertError.code === 'PGRST204' || insertError.message?.includes('plant'))) {
        const fallback = await supabase.from('stock_transactions').insert({
          model_id: selectedModelId,
          transaction_type: 'adjustment',
          quantity: netDelta,
          employee_id: employee.id,
          notes: auditNotes,
        });
        insertError = fallback.error;
      }

      if (insertError) throw insertError;

      showToast(
        `Stock successfully ${adjustmentType === 'add' ? 'added' : 'deducted'} for ${model?.code || 'model'} at ${adjustmentPlant}.`,
        'success'
      );

      // Reset form
      setShowConfirmAdjustmentModal(false);
      setSelectedModelId('');
      setAdjustmentQuantity(1);
      setAdjustmentReason('');

      // Refresh data
      await fetchModelsAndStock();
      await fetchRecentAdjustments();
    } catch (err) {
      console.error('Error performing stock adjustment:', err);
      showToast(err.message || 'Failed to record stock adjustment', 'error');
    } finally {
      setSubmittingAdjustment(false);
    }
  };

  // Aggregate Stats
  const stats = useMemo(() => {
    const totalEmps = employees.length;
    const activeEmps = employees.filter((e) => e.is_active).length;
    const totalActiveModels = models.filter((m) => m.is_active).length;
    const totalAdjustmentsCount = recentAdjustments.length;

    return { totalEmps, activeEmps, totalActiveModels, totalAdjustmentsCount };
  }, [employees, models, recentAdjustments]);

  return (
    <AppShell allowedRoles={['admin', 'owner']}>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              System Administration
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage workforce permissions, perform audited emergency stock corrections, and monitor system health.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="badge-info text-xs py-1 px-3">🛡️ Admin Console</span>
          </div>
        </div>

        {/* Top Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatsCard
            title="Total Employees"
            value={stats.totalEmps}
            icon="👥"
            color="indigo"
            subtitle={`${stats.activeEmps} active accounts`}
          />
          <StatsCard
            title="Cooler Models"
            value={stats.totalActiveModels}
            icon="⚙️"
            color="blue"
            subtitle="Catalog models active"
          />
          <StatsCard
            title="Stock Adjustments"
            value={stats.totalAdjustmentsCount}
            icon="⚖️"
            color="amber"
            subtitle="Audited ledger entries"
          />
          <StatsCard
            title="Database Status"
            value={dbStatus === 'connected' ? 'Online' : 'Checking'}
            icon="🟢"
            color={dbStatus === 'connected' ? 'green' : 'red'}
            subtitle={dbLatency ? `${dbLatency}ms latency` : 'Verifying connection'}
          />
        </div>

        {/* Section Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-2 sm:space-x-4 overflow-x-auto" aria-label="Admin tabs">
            {[
              { id: 'thekedars', label: 'Manage Thekedars', icon: '👷' },
              { id: 'users', label: 'Employee Management', icon: '👥' },
              { id: 'adjustments', label: 'Stock Adjustment (Audited)', icon: '⚖️' },
              { id: 'system', label: 'System Info & Diagnostics', icon: '🖥️' },
            ].map((tab) => {
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id)}
                  className={`whitespace-nowrap pb-3 px-3 sm:px-4 border-b-2 text-xs sm:text-sm font-semibold flex items-center space-x-2 transition-colors ${
                    active
                      ? 'border-primary-600 text-primary-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* SECTION 0: THEKEDAR (CONTRACTOR) MANAGEMENT */}
        {activeSection === 'thekedars' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Header & Add Thekedar Bar */}
            <div className="card p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                    <span>👷 Assembly Thekedars (Contractors)</span>
                    <span className="text-xs bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full uppercase">
                      Admin Access
                    </span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Only Admins have permission to add or remove Thekedars. Factory operators can only select from this approved list.
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Link
                    href="/reports?tab=thekedar_production"
                    className="btn-secondary text-xs py-2 px-3 inline-flex items-center space-x-1.5 shadow-sm"
                  >
                    <span>📊</span>
                    <span>View Production Reports →</span>
                  </Link>
                </div>
              </div>

              {/* Form to Add New Thekedar */}
              <form onSubmit={handleAddThekedar} className="pt-3 border-t border-gray-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={newThekedarName}
                    onChange={(e) => setNewThekedarName(e.target.value)}
                    placeholder="Enter new contractor name (e.g. Ramesh Thekedar)"
                    className="input-field text-xs sm:text-sm bg-gray-50/70 font-medium"
                    disabled={submittingThekedar}
                  />
                </div>
                <button
                  type="submit"
                  disabled={submittingThekedar || !newThekedarName.trim()}
                  className="btn-primary text-xs sm:text-sm py-2 px-5 inline-flex items-center justify-center space-x-1.5 shadow-sm font-bold whitespace-nowrap"
                >
                  <span>+</span>
                  <span>Add Thekedar</span>
                </button>
              </form>
            </div>

            {/* Quick KPI stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatsCard
                title="Active Thekedars"
                value={thekedarsList.length}
                icon="👷"
                color="indigo"
                subtitle="Approved assembly contractors"
              />
              <StatsCard
                title="Permission Level"
                value="Admin Only"
                icon="🔒"
                color="purple"
                subtitle="Non-admins can only select"
              />
              <StatsCard
                title="Production Logging"
                value="Active"
                icon="⚡"
                color="emerald"
                subtitle="Real-time piece rate tracking"
              />
            </div>

            {/* Thekedars Table */}
            <div className="card p-0 overflow-hidden border border-gray-200 shadow-sm">
              <div className="p-4 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Approved Contractor Roster</h4>
                  <p className="text-xs text-gray-500">
                    These Thekedars appear in the production entry dropdown.
                  </p>
                </div>
                <span className="text-xs font-bold text-gray-700 bg-white px-2.5 py-1 rounded-lg border border-gray-200 shadow-sm">
                  {thekedarsList.length} registered
                </span>
              </div>

              {loadingThekedars ? (
                <div className="py-16 text-center">
                  <LoadingSpinner message="Loading contractors list..." size="md" />
                </div>
              ) : thekedarsList.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-xs">
                  <div className="text-3xl mb-2">👷</div>
                  <p className="font-semibold text-gray-700">No Thekedars registered.</p>
                  <p className="text-gray-400 mt-1">Add your first contractor using the form above.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          S.No
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Thekedar Name
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {thekedarsList.map((name, idx) => (
                        <tr key={name} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs">{idx + 1}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900 flex items-center space-x-2">
                            <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
                              👷
                            </span>
                            <span>{name}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="badge-success text-xs font-semibold">Active in Production</span>
                          </td>
                          <td className="px-4 py-3 text-right space-x-2">
                            <Link
                              href={`/reports?tab=thekedar_production&thekedar=${encodeURIComponent(name)}`}
                              className="text-xs font-bold text-primary-700 hover:text-primary-800 hover:underline inline-flex items-center space-x-1"
                            >
                              <span>View Reports</span>
                              <span>→</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleRemoveThekedar(name)}
                              disabled={submittingThekedar}
                              className="text-xs text-red-600 hover:text-red-800 hover:bg-red-50 px-2.5 py-1 rounded-lg transition-colors font-medium border border-red-200 inline-flex items-center space-x-1"
                              title={`Remove ${name}`}
                            >
                              <span>🗑️</span>
                              <span>Remove</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 1: EMPLOYEE MANAGEMENT */}
        {activeSection === 'users' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Header & Add User Button */}
            <div className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Registered Staff & Role Permissions</h3>
                <p className="text-xs text-gray-500">
                  Control who has access to production logging, dispatch loading, and system administrative tools.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowAddUserModal(true)}
                className="btn-primary text-xs py-2 px-4 inline-flex items-center space-x-2 shadow-sm"
              >
                <span>+</span>
                <span>Add Employee Profile</span>
              </button>
            </div>

            {/* Instruction Notice */}
            <div className="bg-primary-50/60 border border-primary-200 rounded-xl p-3.5 text-xs text-primary-900 flex items-start space-x-3">
              <span className="text-lg">ℹ️</span>
              <div className="space-y-1">
                <p className="font-semibold">How Employee Authentication Works:</p>
                <p className="text-primary-800 leading-relaxed">
                  In Jospo E41, login authentication is securely powered by Supabase Auth. When staff sign up or are invited via the Supabase dashboard, an Auth User ID (UUID) is generated. Adding their profile here links their name and role (<em>admin</em>, <em>production</em>, or <em>dispatch</em>) to their login.
                </p>
              </div>
            </div>

            {/* Employees Table */}
            <div className="card p-0 overflow-hidden border border-gray-200">
              {loadingUsers ? (
                <div className="py-16 text-center">
                  <LoadingSpinner message="Loading employee directory..." size="md" />
                </div>
              ) : employees.length === 0 ? (
                <div className="py-16 text-center text-xs text-gray-500">
                  <div className="text-3xl mb-2">👥</div>
                  <p className="font-semibold text-gray-700">No employee records found</p>
                  <p className="mt-1">Add your first employee profile above.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Employee
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Assigned Plant
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Role
                        </th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Auth User ID
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {employees.map((emp) => {
                        const isSelf = emp.id === employee?.id;
                        return (
                          <tr key={emp.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs">
                                  {emp.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                                    <span>{emp.name}</span>
                                    {isSelf && (
                                      <span className="text-[10px] bg-primary-100 text-primary-800 font-bold px-1.5 py-0.5 rounded">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500">{emp.email}</div>
                                </div>
                              </div>
                            </td>

                            {/* Assigned Plant selector / badge */}
                            <td className="px-4 py-3">
                              {emp.role === 'owner' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                  <span>👑</span> All Plants (Owner)
                                </span>
                              ) : (
                                <select
                                  value={emp.plant || DEFAULT_PLANT_ID}
                                  onChange={(e) => handleChangePlant(emp, e.target.value)}
                                  disabled={actionInProgress === emp.id}
                                  className="text-xs font-semibold rounded-lg px-2 py-1 border border-blue-200 focus:ring-1 focus:ring-primary-500 bg-blue-50 text-blue-900"
                                >
                                  {PLANTS.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      🏭 {p.id} ({p.name})
                                    </option>
                                  ))}
                                  <option value="ALL">🌐 ALL (All Plants)</option>
                                </select>
                              )}
                            </td>

                            {/* Role selector dropdown */}
                            <td className="px-4 py-3">
                              <select
                                value={emp.role}
                                onChange={(e) => handleChangeRole(emp, e.target.value)}
                                disabled={actionInProgress === emp.id}
                                className={`text-xs font-semibold rounded-lg px-2 py-1 border border-gray-300 focus:ring-1 focus:ring-primary-500 ${
                                  emp.role === 'owner'
                                    ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                                    : emp.role === 'admin'
                                    ? 'bg-purple-50 text-purple-800 border-purple-200'
                                    : emp.role === 'production'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                <option value="production">Production</option>
                                <option value="dispatch">Dispatch</option>
                                <option value="admin">Admin</option>
                                <option value="owner">👑 Owner</option>
                              </select>
                            </td>

                            {/* Active/Inactive Badge */}
                            <td className="px-4 py-3 text-center">
                              {emp.is_active ? (
                                <span className="badge-success">Active</span>
                              ) : (
                                <span className="badge-danger">Inactive</span>
                              )}
                            </td>

                            {/* UUID */}
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-gray-500 truncate max-w-[140px] block" title={emp.id}>
                                {emp.id}
                              </span>
                            </td>

                            {/* Toggle Button */}
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleToggleActive(emp)}
                                disabled={actionInProgress === emp.id || isSelf}
                                className={`text-xs px-2.5 py-1 rounded-md font-semibold transition-colors ${
                                  emp.is_active
                                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                } ${isSelf ? 'opacity-40 cursor-not-allowed' : ''}`}
                                title={isSelf ? 'Cannot deactivate self' : 'Toggle active state'}
                              >
                                {emp.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 2: STOCK ADJUSTMENT (EMERGENCY USE) */}
        {activeSection === 'adjustments' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Warning Callout Banner */}
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl">
              <div className="flex items-start">
                <span className="text-2xl mr-3">⚠️</span>
                <div>
                  <h4 className="text-sm font-bold text-amber-900">
                    Caution: Stock Adjustments are Audited
                  </h4>
                  <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                    Stock adjustments bypass physical production cycles and dispatch scanner logs. Every single adjustment is permanently written to the <code>stock_transactions</code> ledger with your employee signature, quantity delta, and audit reason. Use only for reconciling physical inventory discrepancies, damaged units, or test corrections.
                  </p>
                </div>
              </div>
            </div>

            {/* Adjustment Form Card */}
            <div className="card space-y-4">
              <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">New Emergency Adjustment</h3>
                  <p className="text-xs text-gray-500">Record a manual correction to active cooler model stock</p>
                </div>
                <span className="text-xl">⚖️</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Select Model */}
                <div className="sm:col-span-2">
                  <label htmlFor="adjustModel" className="label text-xs">
                    Cooler Model <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="adjustModel"
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="input-field text-sm py-2"
                  >
                    <option value="">-- Choose Cooler Model to Adjust --</option>
                    {models.map((m) => {
                      const stock = stockMap[m.id] ?? 0;
                      return (
                        <option key={m.id} value={m.id}>
                          {m.code} - {m.name} (Current Stock: {stock} units)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Target Plant for Adjustment */}
                <div className="sm:col-span-2">
                  <label htmlFor="adjustPlant" className="label text-xs">
                    Target Plant <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="adjustPlant"
                    value={adjustmentPlant}
                    onChange={(e) => setAdjustmentPlant(e.target.value)}
                    className="input-field text-sm py-2 font-semibold"
                  >
                    {PLANTS.map((p) => (
                      <option key={p.id} value={p.id}>
                        🏭 {p.id} — {p.name} ({p.city})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Select which manufacturing plant&apos;s physical inventory balance is being adjusted.
                  </p>
                </div>

                {/* Adjustment Type: Add or Deduct */}
                <div>
                  <label className="label text-xs">
                    Adjustment Type <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjustmentType('add')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center space-x-1.5 ${
                        adjustmentType === 'add'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-400 ring-2 ring-emerald-200'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span>➕</span>
                      <span>Add Stock (+)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustmentType('deduct')}
                      className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center space-x-1.5 ${
                        adjustmentType === 'deduct'
                          ? 'bg-rose-50 text-rose-700 border-rose-400 ring-2 ring-rose-200'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span>➖</span>
                      <span>Deduct Stock (-)</span>
                    </button>
                  </div>
                </div>

                {/* Quantity */}
                <div>
                  <label htmlFor="adjustQty" className="label text-xs">
                    Quantity to Adjust <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="adjustQty"
                    type="number"
                    min="1"
                    value={adjustmentQuantity}
                    onChange={(e) => setAdjustmentQuantity(e.target.value)}
                    className="input-field text-sm py-2"
                  />
                </div>

                {/* Audit Reason */}
                <div className="sm:col-span-2">
                  <label htmlFor="adjustReason" className="label text-xs">
                    Audit Reason & Justification <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="adjustReason"
                    rows={2}
                    required
                    placeholder="e.g., Annual warehouse physical count discrepancy (+3 units), Water tank cracked in transit (-1 unit)..."
                    value={adjustmentReason}
                    onChange={(e) => setAdjustmentReason(e.target.value)}
                    className="input-field text-xs sm:text-sm"
                  />
                </div>
              </div>

              {/* Current vs Projected Stock Preview */}
              {selectedModelId && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-xs flex items-center justify-between">
                  <div>
                    <span className="text-gray-500">Current Stock: </span>
                    <strong className="text-gray-900">{stockMap[selectedModelId] ?? 0} units</strong>
                  </div>
                  <span className="text-gray-400">→</span>
                  <div>
                    <span className="text-gray-500">Projected Stock After Adjustment: </span>
                    <strong className="text-primary-700 font-bold">
                      {(stockMap[selectedModelId] ?? 0) +
                        (adjustmentType === 'add'
                          ? Number(adjustmentQuantity) || 0
                          : -(Number(adjustmentQuantity) || 0))}{' '}
                      units
                    </strong>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-gray-100 flex justify-end">
                <button
                  type="button"
                  disabled={
                    !selectedModelId ||
                    !adjustmentReason.trim() ||
                    Number(adjustmentQuantity) <= 0
                  }
                  onClick={() => setShowConfirmAdjustmentModal(true)}
                  className="btn-primary text-xs py-2 px-5 inline-flex items-center space-x-1.5"
                >
                  <span>Review & Apply Adjustment</span>
                  <span>→</span>
                </button>
              </div>
            </div>

            {/* Recent Adjustments Audit Log */}
            <div className="card p-0 overflow-hidden border border-gray-200">
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                    Recent Audited Adjustments Log
                  </h4>
                  <p className="text-[11px] text-gray-500">Latest manual inventory overrides</p>
                </div>
                <button
                  type="button"
                  onClick={fetchRecentAdjustments}
                  className="text-xs text-primary-600 hover:text-primary-800 font-semibold"
                >
                  Refresh Log
                </button>
              </div>

              {loadingAdjustments ? (
                <div className="py-12 text-center">
                  <LoadingSpinner message="Loading audit history..." size="sm" />
                </div>
              ) : recentAdjustments.length === 0 ? (
                <div className="py-12 text-center text-xs text-gray-500">
                  <p>No emergency adjustments recorded yet. Inventory is fully aligned with production and dispatch logs.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Timestamp</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Model</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Adjustment</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Officer</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Audit Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {recentAdjustments.map((tx) => (
                        <tr key={tx.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 whitespace-nowrap text-gray-500 text-xs">
                            {new Date(tx.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-mono font-bold text-primary-700">
                              {tx.cooler_models?.code}
                            </span>
                            <span className="block text-gray-500 text-[11px]">
                              {tx.cooler_models?.name}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-extrabold whitespace-nowrap">
                            <span className={tx.quantity >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                              {tx.quantity >= 0 ? `+${tx.quantity}` : tx.quantity} units
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                            {tx.employees?.name || 'Admin'}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 text-xs truncate max-w-xs">
                            {tx.notes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 3: SYSTEM INFO & DIAGNOSTICS */}
        {activeSection === 'system' && (
          <div className="space-y-5 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Database & Infrastructure */}
              <div className="card space-y-3">
                <div className="flex items-center space-x-2 border-b border-gray-100 pb-2.5">
                  <span className="text-xl">🗄️</span>
                  <h3 className="text-sm font-bold text-gray-900">Database & Cloud Backend</h3>
                </div>
                <div className="text-xs space-y-2 text-gray-700">
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Provider:</span>
                    <span className="font-semibold text-gray-900">Supabase PostgreSQL 15+</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Connection State:</span>
                    <span className="flex items-center space-x-1.5 font-bold text-emerald-700">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{dbStatus === 'connected' ? 'Connected & Healthy' : 'Checking'}</span>
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Query Round-Trip Latency:</span>
                    <span className="font-mono font-semibold text-gray-900">
                      {dbLatency ? `${dbLatency} ms` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-500">Row Level Security (RLS):</span>
                    <span className="badge-success text-[10px]">Enabled & Enforced</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={checkDatabaseHealth}
                    className="btn-secondary text-xs w-full py-1.5"
                  >
                    Run Health Check Ping
                  </button>
                </div>
              </div>

              {/* Application Details */}
              <div className="card space-y-3">
                <div className="flex items-center space-x-2 border-b border-gray-100 pb-2.5">
                  <span className="text-xl">❄️</span>
                  <h3 className="text-sm font-bold text-gray-900">Application Environment</h3>
                </div>
                <div className="text-xs space-y-2 text-gray-700">
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">System Name:</span>
                    <span className="font-bold text-gray-900">Jospo E41 MFG System</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Framework:</span>
                    <span className="font-semibold text-gray-900">Next.js 14 App Router</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-500">Version:</span>
                    <span className="font-mono font-bold text-primary-700">v1.0.0</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-500">Active User:</span>
                    <span className="font-semibold text-gray-900">
                      {employee?.name} ({employee?.email})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Models Master Quick Table */}
            <div className="card p-0 overflow-hidden border border-gray-200">
              <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                    Cooler Models Master Directory ({models.length})
                  </h4>
                  <p className="text-[11px] text-gray-500">QR Code bindings and active catalogue status</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Code</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Model Name</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-600">QR Scan String</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-600">Current Stock</th>
                      <th className="px-4 py-2.5 text-center font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {models.map((m) => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono font-bold text-primary-700">{m.code}</td>
                        <td className="px-4 py-2.5 text-gray-900 font-medium">{m.name}</td>
                        <td className="px-4 py-2.5 font-mono text-gray-600 bg-gray-50 rounded">
                          {m.qr_data}
                        </td>
                        <td className="px-4 py-2.5 text-right font-extrabold text-gray-900">
                          {stockMap[m.id] ?? 0} units
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {m.is_active ? (
                            <span className="badge-success">Active</span>
                          ) : (
                            <span className="badge-danger">Inactive</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: ADD EMPLOYEE PROFILE */}
        {showAddUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="card max-w-md w-full p-6 shadow-2xl animate-scaleUp">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                <div className="flex items-center space-x-2.5">
                  <span className="text-xl">👤</span>
                  <h3 className="text-base font-bold text-gray-900">Add Employee Profile</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  ✕
                </button>
              </div>

              {/* Mode Toggle */}
              <div className="flex rounded-lg bg-gray-100 p-1 mb-3">
                <button
                  type="button"
                  onClick={() => setCreationMode('auto')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${
                    creationMode === 'auto'
                      ? 'bg-white text-primary-700 shadow-xs'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  ⚡ One-Step Account Creation
                </button>
                <button
                  type="button"
                  onClick={() => setCreationMode('manual')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition-all ${
                    creationMode === 'manual'
                      ? 'bg-white text-primary-700 shadow-xs'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  🔗 Link Existing UUID
                </button>
              </div>

              <form onSubmit={handleAddEmployee} className="space-y-4 text-xs">
                <div>
                  <label htmlFor="newUserName" className="label text-xs">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="newUserName"
                    type="text"
                    required
                    placeholder="e.g. Vikram Sharma"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="input-field text-xs bg-white"
                  />
                </div>

                <div>
                  <label htmlFor="newUserEmail" className="label text-xs">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="newUserEmail"
                    type="email"
                    required
                    placeholder="e.g. vikram@jospo.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="input-field text-xs bg-white"
                  />
                </div>

                {creationMode === 'auto' ? (
                  <div>
                    <label htmlFor="newUserPassword" className="label text-xs">
                      Password (min 6 characters) <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="newUserPassword"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="input-field text-xs bg-white font-mono"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Login credentials and employee profile will be generated instantly in Supabase Auth.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="newUserId" className="label text-xs">
                      Supabase Auth User ID (UUID) <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="newUserId"
                      type="text"
                      required
                      placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                      value={newUserId}
                      onChange={(e) => setNewUserId(e.target.value)}
                      className="input-field font-mono text-xs bg-white"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Copy the UUID from Supabase Auth dashboard after user registers or is invited.
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="newUserPlant" className="label text-xs">
                    Assigned Manufacturing Plant <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="newUserPlant"
                    value={newUserPlant}
                    onChange={(e) => setNewUserPlant(e.target.value)}
                    className="input-field text-xs bg-white"
                  >
                    {PLANTS.map((p) => (
                      <option key={p.id} value={p.id}>
                        🏭 {p.id} — {p.name} ({p.city})
                      </option>
                    ))}
                    <option value="ALL">🌐 ALL — Multi-Plant Oversight</option>
                  </select>
                  <p className="text-[11px] text-gray-500 mt-1">
                    Staff will strictly only see this plant&apos;s inventory, dispatches, and production entries.
                  </p>
                </div>

                <div>
                  <label htmlFor="newUserRole" className="label text-xs">
                    System Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="newUserRole"
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="input-field text-xs"
                  >
                    <option value="production">Production (Manufacturing Entries & View Stock)</option>
                    <option value="dispatch">Dispatch (QR Scanning, Loading & Vehicle Outward)</option>
                    <option value="admin">Admin (Full System Permissions & Reports)</option>
                    <option value="owner">👑 Owner (Multi-Plant Oversight & Consolidated Control)</option>
                  </select>
                </div>

                <div className="pt-3 border-t border-gray-100 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    disabled={submittingUser}
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingUser}
                    className="btn-primary text-xs py-2 px-5"
                  >
                    {submittingUser ? 'Saving...' : 'Create Employee Profile'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: CONFIRM STOCK ADJUSTMENT */}
        {showConfirmAdjustmentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="card max-w-md w-full p-6 shadow-2xl animate-scaleUp">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xl">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Confirm Stock Adjustment</h3>
                  <p className="text-xs text-amber-700 font-semibold">Audited Ledger Operation</p>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5 mb-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Model:</span>
                  <span className="font-bold text-gray-900">
                    {models.find((m) => m.id === selectedModelId)?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Action:</span>
                  <span
                    className={`font-bold ${
                      adjustmentType === 'add' ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {adjustmentType === 'add' ? 'ADD (+)' : 'DEDUCT (-)'} {adjustmentQuantity} units
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Reason:</span>
                  <span className="font-medium text-gray-900 italic">{adjustmentReason}</span>
                </div>
              </div>

              <p className="text-xs text-gray-600 mb-6 leading-relaxed">
                This transaction will permanently modify stock calculations in the <code>current_stock</code> view and will be logged under your employee profile.
              </p>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowConfirmAdjustmentModal(false)}
                  disabled={submittingAdjustment}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePerformStockAdjustment}
                  disabled={submittingAdjustment}
                  className="btn-danger text-xs py-2 px-4 shadow-sm"
                >
                  {submittingAdjustment ? 'Applying...' : 'Confirm Adjustment'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
