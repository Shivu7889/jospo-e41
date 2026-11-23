'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getSupabase } from '@/lib/supabase';
import { getTodayIST } from '@/lib/date';
import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/AppShell';
import StatsCard from '@/components/StatsCard';
import DataTable from '@/components/DataTable';
import LoadingSpinner from '@/components/LoadingSpinner';

import { usePlant } from '@/contexts/PlantContext';
import {
  PLANTS,
  ALL_PLANTS_ID,
  DEFAULT_PLANT_ID,
  normalizePlant,
  isInboundEnabledForPlant,
  getPlantMeta,
} from '@/lib/plants';

export default function DashboardPage() {
  const { employee, user } = useAuth();
  const { activePlant, isOwner, userPlant, inboundTransfersCount } = usePlant();

  // Instant SWR state initialization from sessionStorage
  const [stats, setStats] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('jospo_dashboard_cache');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.stats) return parsed.stats;
        }
      } catch (e) {}
    }
    return {
      total_production_today: 0,
      total_dispatch_today: 0,
      total_stock: 0,
      pending_dispatches: 0,
      total_models: 0,
    };
  });

  const [plantBreakdown, setPlantBreakdown] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('jospo_dashboard_cache');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.plantBreakdown) return parsed.plantBreakdown;
        }
      } catch (e) {}
    }
    return null;
  });

  const [todayProduction, setTodayProduction] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('jospo_dashboard_cache');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.todayProduction)) return parsed.todayProduction;
        }
      } catch (e) {}
    }
    return [];
  });

  const [recentDispatches, setRecentDispatches] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('jospo_dashboard_cache');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.recentDispatches)) return parsed.recentDispatches;
        }
      } catch (e) {}
    }
    return [];
  });

  // If cached data is present, render immediately (0ms) without showing loading spinner
  const [loading, setLoading] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('jospo_dashboard_cache');
        if (raw) return false;
      } catch (e) {}
    }
    return true;
  });

  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      }
      setError(null);

      const supabase = getSupabase();
      const todayStr = getTodayIST();

      let fetchedStats = {
        total_production_today: 0,
        total_dispatch_today: 0,
        total_stock: 0,
        pending_dispatches: 0,
        total_models: 0,
      };

      // Prepare pending drafts count query
      let pendingQuery = supabase
        .from('dispatches')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft');

      if (activePlant !== ALL_PLANTS_ID) {
        pendingQuery = pendingQuery.eq('from_location', activePlant);
      }

      // Prepare recent dispatches query (last 5)
      let dispQuery = supabase
        .from('dispatches')
        .select(`
          id,
          vehicle_number,
          from_location,
          destination,
          destination_plant,
          transfer_status,
          dispatch_date,
          status,
          created_at,
          dispatch_items (
            quantity,
            cooler_models (name, code)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      if (activePlant !== ALL_PLANTS_ID) {
        dispQuery = dispQuery.eq('from_location', activePlant);
      }

      // Execute all 4 independent data sources in parallel (cuts dashboard load time by up to 75%)
      const [stockResult, pendingResult, prodResult, dispResult] = await Promise.allSettled([
        fetch(`/api/stock?plant=${encodeURIComponent(activePlant)}`).then((r) => (r.ok ? r.json() : null)),
        pendingQuery,
        fetch(`/api/production?date=${todayStr}&plant=${encodeURIComponent(activePlant)}`).then((r) => (r.ok ? r.json() : null)),
        dispQuery,
      ]);

      // 1. Process Stock API result
      if (stockResult.status === 'fulfilled' && stockResult.value?.success && stockResult.value?.stats) {
        const stockJson = stockResult.value;
        fetchedStats = {
          total_production_today: stockJson.stats.todayProduction ?? 0,
          total_dispatch_today: stockJson.stats.todayDispatch ?? 0,
          total_stock: stockJson.stats.totalStock ?? 0,
          pending_dispatches: 0,
          total_models: stockJson.stats.activeModelsCount ?? 0,
        };
        if (activePlant === ALL_PLANTS_ID && stockJson.currentStock) {
          const totals = { 'E41 G2': 0, 'D4': 0, 'C116': 0 };
          stockJson.currentStock.forEach((m) => {
            if (m.plant_breakdown) {
              totals['E41 G2'] += m.plant_breakdown['E41 G2'] || 0;
              totals['D4'] += m.plant_breakdown['D4'] || 0;
              totals['C116'] += m.plant_breakdown['C116'] || 0;
            }
          });
          setPlantBreakdown(totals);
        } else {
          setPlantBreakdown(null);
        }
      }

      // 2. Process Pending Drafts count
      if (pendingResult.status === 'fulfilled') {
        const count = pendingResult.value.count || 0;
        fetchedStats.pending_dispatches = count;
      }
      setStats(fetchedStats);

      // 3. Process Production API result
      if (prodResult.status === 'fulfilled' && prodResult.value?.success && prodResult.value?.entries) {
        const grouped = {};
        prodResult.value.entries.forEach((entry) => {
          const code = entry.model_code || 'Unknown';
          if (!grouped[code]) {
            grouped[code] = {
              model_name: entry.model_name || code,
              model_code: code,
              total_quantity: 0,
              entry_count: 0,
            };
          }
          grouped[code].total_quantity += entry.quantity || 0;
          grouped[code].entry_count += 1;
        });
        setTodayProduction(Object.values(grouped));
      }

      // 4. Process Recent Dispatches
      let processedRecent = [];
      if (dispResult.status === 'fulfilled' && dispResult.value?.data) {
        processedRecent = dispResult.value.data.map((d) => ({
          ...d,
          total_quantity: (d.dispatch_items || []).reduce((sum, item) => sum + (item.quantity || 0), 0),
        }));
        setRecentDispatches(processedRecent);
      }

      // 5. Cache snapshot to sessionStorage for instant 0ms subsequent renders
      if (typeof window !== 'undefined') {
        try {
          const prodList = prodResult.status === 'fulfilled' && prodResult.value?.entries ? Object.values(grouped || {}) : [];
          sessionStorage.setItem('jospo_dashboard_cache', JSON.stringify({
            stats: fetchedStats,
            plantBreakdown: plantBreakdown || null,
            todayProduction: prodList,
            recentDispatches: processedRecent,
          }));
        } catch (e) {}
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Could not load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activePlant]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const role = employee?.role || 'production';
  const todayFormatted = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return <span className="badge-success">Confirmed</span>;
      case 'draft':
        return <span className="badge-warning">Draft (Pending)</span>;
      case 'cancelled':
        return <span className="badge-danger">Cancelled</span>;
      default:
        return <span className="badge-info">{status}</span>;
    }
  };

  const productionColumns = [
    {
      key: 'model_name',
      label: 'Cooler Model',
      render: (val, row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-gray-900">{val || 'Unnamed Model'}</span>
          <span className="text-xs text-gray-500 font-mono">{row.model_code}</span>
        </div>
      ),
    },
    {
      key: 'entry_count',
      label: 'Batches',
      align: 'center',
      render: (val) => (
        <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
          {val || 1} {val === 1 ? 'entry' : 'entries'}
        </span>
      ),
    },
    {
      key: 'total_quantity',
      label: 'Qty Produced',
      align: 'right',
      render: (val) => (
        <span className="text-sm font-bold text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md border border-primary-100">
          +{(val || 0).toLocaleString()}
        </span>
      ),
    },
  ];

  const dispatchColumns = [
    {
      key: 'vehicle_number',
      label: 'Vehicle & Route',
      render: (val, row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-gray-900 uppercase tracking-wider">{val}</span>
          <span className="text-xs text-gray-500">To: {row.destination}</span>
        </div>
      ),
    },
    {
      key: 'total_quantity',
      label: 'Units',
      align: 'center',
      render: (val) => (
        <span className="text-xs font-semibold text-gray-800">
          {(val || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'dispatch_date',
      label: 'Date',
      render: (val) => <span className="text-xs text-gray-600">{val || '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      align: 'right',
      render: (val) => getStatusBadge(val),
    },
  ];

  return (
    <AppShell allowedRoles={['admin', 'production', 'dispatch']}>
      <div className="space-y-6">
        {/* Welcome & Action Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                Welcome, {employee?.name || user?.email?.split('@')[0] || 'User'} 👋
              </h1>
              {activePlant === ALL_PLANTS_ID ? (
                <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                  <span>🌐</span> Consolidated View (All 3 Plants)
                </span>
              ) : (
                <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 inline-flex items-center gap-1">
                  <span>🏭</span> Plant: {activePlant}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
              <span>📅 {todayFormatted}</span>
              <span>•</span>
              <span className="capitalize font-medium text-primary-700">
                {role} Operations
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick action buttons based on role */}
            {['admin', 'production', 'owner'].includes(role) && (
              <Link
                href="/production"
                className="btn-primary text-xs sm:text-sm inline-flex items-center space-x-1.5 shadow-sm"
              >
                <span>🏭</span>
                <span>Add Production</span>
              </Link>
            )}

            {['admin', 'dispatch', 'owner'].includes(role) && (
              <Link
                href="/dispatch/new"
                className="btn-success text-xs sm:text-sm inline-flex items-center space-x-1.5 shadow-sm"
              >
                <span>📦</span>
                <span>New Dispatch</span>
              </Link>
            )}

            <button
              type="button"
              onClick={() => fetchDashboardData(true)}
              disabled={refreshing}
              className="btn-secondary text-xs sm:text-sm inline-flex items-center space-x-1.5"
              title="Refresh dashboard stats"
            >
              <svg
                className={`w-4 h-4 text-gray-600 ${refreshing ? 'animate-spin' : ''}`}
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
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Inbound Inter-Plant Transfers Alert Banner */}
        {inboundTransfersCount > 0 && (activePlant === ALL_PLANTS_ID || isInboundEnabledForPlant(activePlant)) && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 text-amber-950 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-pulse">
            <div className="flex items-center space-x-3">
              <span className="text-3xl">🚚</span>
              <div>
                <p className="font-extrabold text-sm sm:text-base text-amber-900 flex items-center gap-2">
                  <span>Inbound Stock Alert:</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-xs">
                    {inboundTransfersCount} Transfer{inboundTransfersCount > 1 ? 's' : ''} Pending Receipt
                  </span>
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Shipments have been dispatched to your plant and are awaiting physical verification & stock acceptance.
                </p>
              </div>
            </div>
            <Link
              href="/dispatch?tab=inbound"
              className="btn-primary bg-amber-600 hover:bg-amber-700 border-amber-700 text-white text-xs sm:text-sm font-bold shadow whitespace-nowrap self-start sm:self-center"
            >
              📥 Verify & Accept Stock →
            </Link>
          </div>
        )}

        {/* Error Alert if any */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <span className="text-lg">⚠️</span>
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => fetchDashboardData()}
              className="underline font-semibold hover:text-red-900"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="card py-16 text-center">
            <LoadingSpinner message="Calculating real-time manufacturing & inventory stats..." size="lg" />
          </div>
        ) : (
          <>
            {/* 3-Plant Comparative Physical Inventory Overview (for Owner / Consolidated view) */}
            {activePlant === ALL_PLANTS_ID && plantBreakdown && (
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl border border-indigo-900 shadow-md">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">🏭</span>
                    <div>
                      <h3 className="font-bold text-sm sm:text-base text-white">
                        3-Plant Physical Inventory Overview (Real-Time)
                      </h3>
                      <p className="text-xs text-slate-300">
                        Consolidated live stock across all manufacturing & dispatch units
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                    👑 Owner Multi-Plant View
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {PLANTS.map((p) => {
                    const qty = plantBreakdown[p.id] || 0;
                    return (
                      <div
                        key={p.id}
                        className="bg-white/10 hover:bg-white/15 transition-colors backdrop-blur-sm p-4 rounded-xl border border-white/10 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-200">{p.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-white/20 text-white font-mono font-bold">
                            {p.id}
                          </span>
                        </div>
                        <div className="mt-3">
                          <p className="text-2xl font-black text-white">{qty.toLocaleString()}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">Physical Units in Stock</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 5 Stats Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatsCard
                title="Production Today"
                value={stats.total_production_today}
                icon="🏭"
                color="blue"
                subtitle="Coolers assembled"
              />
              <StatsCard
                title="Dispatch Today"
                value={stats.total_dispatch_today}
                icon="📦"
                color="green"
                subtitle="Coolers dispatched"
              />
              <StatsCard
                title="Available Stock"
                value={stats.total_stock}
                icon="📋"
                color="indigo"
                subtitle="In-unit inventory"
              />
              <StatsCard
                title="Pending Dispatches"
                value={stats.pending_dispatches}
                icon="⏳"
                color="yellow"
                subtitle="Awaiting confirmation"
              />
              <StatsCard
                title="Active Models"
                value={stats.total_models}
                icon="⚙️"
                color="purple"
                subtitle="Product master variants"
              />
            </div>

            {/* Two Column Layout: Today's Production & Recent Dispatches */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Today's Production Card */}
              <div className="card flex flex-col">
                <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-lg">
                      🏭
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-gray-900">Today&apos;s Production</h2>
                      <p className="text-xs text-gray-500">Model-wise breakdown of assembly entries</p>
                    </div>
                  </div>
                  {['admin', 'production'].includes(role) && (
                    <Link
                      href="/production"
                      className="text-xs font-semibold text-primary-600 hover:text-primary-800"
                    >
                      View All →
                    </Link>
                  )}
                </div>

                <div className="mt-4 flex-1">
                  <DataTable
                    columns={productionColumns}
                    data={todayProduction}
                    emptyMessage="No production entries recorded today yet."
                  />
                </div>

                {todayProduction.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600 font-medium">
                    <span>
                      Total Models: <strong className="text-gray-900">{todayProduction.length}</strong>
                    </span>
                    <span>
                      Total Assembled:{' '}
                      <strong className="text-primary-700 font-bold">
                        {todayProduction
                          .reduce((sum, item) => sum + (item.total_quantity || 0), 0)
                          .toLocaleString()}{' '}
                        units
                      </strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Recent Dispatches Card */}
              <div className="card flex flex-col">
                <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">
                      📦
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-gray-900">Recent Dispatches</h2>
                      <p className="text-xs text-gray-500">Last 5 outgoing cooler shipments</p>
                    </div>
                  </div>
                  {['admin', 'dispatch'].includes(role) && (
                    <Link
                      href="/dispatch"
                      className="text-xs font-semibold text-primary-600 hover:text-primary-800"
                    >
                      View All →
                    </Link>
                  )}
                </div>

                <div className="mt-4 flex-1">
                  <DataTable
                    columns={dispatchColumns}
                    data={recentDispatches}
                    emptyMessage="No dispatch records found in the system."
                  />
                </div>

                {recentDispatches.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-600">
                    <span>Showing last {recentDispatches.length} dispatch logs</span>
                    <Link
                      href="/stock"
                      className="text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Check stock ledger →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
