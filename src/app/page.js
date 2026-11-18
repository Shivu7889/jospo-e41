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

export default function DashboardPage() {
  const { employee, user } = useAuth();
  const [stats, setStats] = useState({
    total_production_today: 0,
    total_dispatch_today: 0,
    total_stock: 0,
    pending_dispatches: 0,
    total_models: 0,
  });
  const [todayProduction, setTodayProduction] = useState([]);
  const [recentDispatches, setRecentDispatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const supabase = getSupabase();
      const todayStr = getTodayIST();

      // 1. Fetch Stats via RPC or fallback
      let fetchedStats = {
        total_production_today: 0,
        total_dispatch_today: 0,
        total_stock: 0,
        pending_dispatches: 0,
        total_models: 0,
      };

      const { data: rpcStats, error: rpcError } = await supabase.rpc('get_dashboard_stats');

      if (!rpcError && rpcStats) {
        fetchedStats = {
          total_production_today: Number(rpcStats.total_production_today ?? 0),
          total_dispatch_today: Number(rpcStats.total_dispatch_today ?? 0),
          total_stock: Number(rpcStats.total_stock ?? 0),
          pending_dispatches: Number(rpcStats.pending_dispatches ?? 0),
          total_models: Number(rpcStats.total_models ?? 0),
        };
      } else {
        // Fallback direct table queries
        try {
          const [prodRes, dispRes, stockRes, pendingRes, modelsRes] = await Promise.all([
            supabase
              .from('production_entries')
              .select('quantity')
              .eq('production_date', todayStr),
            supabase
              .from('dispatches')
              .select('id, dispatch_items(quantity)')
              .eq('dispatch_date', todayStr)
              .eq('status', 'confirmed'),
            supabase
              .from('stock_transactions')
              .select('quantity'),
            supabase
              .from('dispatches')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'draft'),
            supabase
              .from('cooler_models')
              .select('id', { count: 'exact', head: true })
              .eq('is_active', true),
          ]);

          const prodTotal = (prodRes.data || []).reduce((acc, row) => acc + (row.quantity || 0), 0);
          let dispTotal = 0;
          (dispRes.data || []).forEach((d) => {
            (d.dispatch_items || []).forEach((item) => {
              dispTotal += item.quantity || 0;
            });
          });
          const stockTotal = (stockRes.data || []).reduce((acc, row) => acc + (row.quantity || 0), 0);

          fetchedStats = {
            total_production_today: prodTotal,
            total_dispatch_today: dispTotal,
            total_stock: stockTotal,
            pending_dispatches: pendingRes.count || 0,
            total_models: modelsRes.count || 0,
          };
        } catch (fbErr) {
          console.warn('Fallback stats calculation warning:', fbErr);
        }
      }
      setStats(fetchedStats);

      // 2. Fetch Today's Production from daily_production_summary view
      const { data: prodData, error: prodErr } = await supabase
        .from('daily_production_summary')
        .select('*')
        .eq('production_date', todayStr)
        .order('model_code', { ascending: true });

      if (!prodErr && prodData) {
        setTodayProduction(prodData);
      } else {
        // Fallback from production_entries
        const { data: rawEntries } = await supabase
          .from('production_entries')
          .select('quantity, cooler_models(name, code)')
          .eq('production_date', todayStr);

        if (rawEntries) {
          const grouped = {};
          rawEntries.forEach((entry) => {
            const code = entry.cooler_models?.code || 'Unknown';
            if (!grouped[code]) {
              grouped[code] = {
                model_name: entry.cooler_models?.name || code,
                model_code: code,
                total_quantity: 0,
                entry_count: 0,
              };
            }
            grouped[code].total_quantity += entry.quantity || 0;
            grouped[code].entry_count += 1;
          });
          setTodayProduction(Object.values(grouped));
        } else {
          setTodayProduction([]);
        }
      }

      // 3. Fetch Recent Dispatches (last 5)
      const { data: dispData, error: dispErr } = await supabase
        .from('dispatches')
        .select(`
          id,
          vehicle_number,
          from_location,
          destination,
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

      if (!dispErr && dispData) {
        const formatted = dispData.map((d) => {
          const totalQty = (d.dispatch_items || []).reduce(
            (sum, item) => sum + (item.quantity || 0),
            0
          );
          return {
            ...d,
            total_quantity: totalQty,
          };
        });
        setRecentDispatches(formatted);
      } else {
        setRecentDispatches([]);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Could not load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
                Welcome, {employee?.name || user?.email?.split('@')[0] || 'User'} 👋
              </h1>
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
            {['admin', 'production'].includes(role) && (
              <Link
                href="/production"
                className="btn-primary text-xs sm:text-sm inline-flex items-center space-x-1.5 shadow-sm"
              >
                <span>🏭</span>
                <span>Add Production</span>
              </Link>
            )}

            {['admin', 'dispatch'].includes(role) && (
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
