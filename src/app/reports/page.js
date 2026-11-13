'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatsCard from '@/components/StatsCard';
import { useToast } from '@/components/Toast';

export default function ReportsPage() {
  const { showToast } = useToast();

  // Active Tab: 'daily_production' | 'daily_dispatch' | 'monthly_summary' | 'model_stock'
  const [activeTab, setActiveTab] = useState('daily_production');

  // Filter States
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [productionDate, setProductionDate] = useState(todayStr);
  const [dispatchDate, setDispatchDate] = useState(todayStr);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Data States
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);

  // Export to Excel helper
  const handleExportToExcel = (data, filename) => {
    try {
      if (!data || data.length === 0) {
        showToast('No data available to export.', 'warning');
        return;
      }
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      XLSX.writeFile(wb, `${filename}.xlsx`);
      showToast(`Exported ${filename}.xlsx successfully!`, 'success');
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      showToast('Failed to export to Excel: ' + err.message, 'error');
    }
  };

  // Fetch Report Data from /api/reports
  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      let url = `/api/reports?type=${activeTab}`;

      if (activeTab === 'daily_production') {
        url += `&date=${productionDate}`;
      } else if (activeTab === 'daily_dispatch') {
        url += `&date=${dispatchDate}`;
      } else if (activeTab === 'monthly_summary') {
        url += `&month=${selectedMonth}&year=${selectedYear}`;
      }

      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch report');
      }

      setReportData(json);
    } catch (err) {
      console.error('Error fetching report:', err);
      showToast(err.message || 'Error generating report', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, productionDate, dispatchDate, selectedMonth, selectedYear, showToast]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <AppShell allowedRoles={['admin']}>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Manufacturing & Stock Reports
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Audit logs, production figures, dispatch performance, and Excel spreadsheets.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={fetchReport}
              disabled={loading}
              className="btn-secondary text-sm inline-flex items-center space-x-1.5"
            >
              <svg
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
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
              <span>Refresh Report</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-2 sm:space-x-4 overflow-x-auto" aria-label="Reports tabs">
            {[
              { id: 'daily_production', label: 'Daily Production', icon: '🏭' },
              { id: 'daily_dispatch', label: 'Daily Dispatch', icon: '🚚' },
              { id: 'monthly_summary', label: 'Monthly Summary', icon: '📊' },
              { id: 'model_stock', label: 'Model-wise Stock', icon: '📋' },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
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

        {/* 1. DAILY PRODUCTION REPORT */}
        {activeTab === 'daily_production' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Filter & Export Bar */}
            <div className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center space-x-3 text-xs sm:text-sm">
                <span className="font-semibold text-gray-700">Production Date:</span>
                <input
                  type="date"
                  value={productionDate}
                  onChange={(e) => setProductionDate(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  const exportRows = (reportData?.data || []).map((r) => ({
                    'Date': r.production_date,
                    'Model Code': r.model_code,
                    'Model Name': r.model_name,
                    'Quantity': r.quantity,
                    'Logged By': r.employee_name,
                    'Remarks': r.remarks,
                    'Timestamp': r.created_at,
                  }));
                  handleExportToExcel(exportRows, `Jospo_Daily_Production_${productionDate}`);
                }}
                disabled={loading || !reportData?.data?.length}
                className="btn-success text-xs py-2 px-4 inline-flex items-center space-x-2 shadow-sm"
              >
                <span>📥</span>
                <span>Export to Excel (.xlsx)</span>
              </button>
            </div>

            {/* Quick Stat Card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatsCard
                title="Date"
                value={productionDate}
                icon="📅"
                color="indigo"
                subtitle="Selected production day"
              />
              <StatsCard
                title="Total Units Produced"
                value={reportData?.total_quantity ?? 0}
                icon="❄️"
                color="green"
                subtitle="Total coolers manufactured"
              />
              <StatsCard
                title="Production Entries"
                value={reportData?.data?.length ?? 0}
                icon="📝"
                color="blue"
                subtitle="Batches recorded"
              />
            </div>

            {/* Report Table */}
            <div className="card p-0 overflow-hidden border border-gray-200">
              {loading ? (
                <div className="py-16 text-center">
                  <LoadingSpinner message="Calculating daily production figures..." size="md" />
                </div>
              ) : !reportData?.data?.length ? (
                <div className="py-16 text-center text-gray-500 text-xs">
                  <div className="text-3xl mb-2">🏭</div>
                  <p className="font-semibold text-gray-700">No production entries recorded on {productionDate}</p>
                  <p className="mt-1">Try picking a different date or log entries in the Production module.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Model Code
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Model Name
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Employee
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Remarks
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {reportData.data.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono font-bold text-primary-700">
                            {row.model_code}
                          </td>
                          <td className="px-4 py-3 text-gray-900 font-medium">{row.model_name}</td>
                          <td className="px-4 py-3 text-right font-extrabold text-gray-900">
                            {row.quantity} units
                          </td>
                          <td className="px-4 py-3 text-gray-700">{row.employee_name}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-xs">
                            {row.remarks || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900 text-xs sm:text-sm">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-left">
                          DAILY TOTAL PRODUCTION
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700 text-base">
                          {reportData.total_quantity} units
                        </td>
                        <td colSpan={2} className="px-4 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. DAILY DISPATCH REPORT */}
        {activeTab === 'daily_dispatch' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Filter & Export Bar */}
            <div className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center space-x-3 text-xs sm:text-sm">
                <span className="font-semibold text-gray-700">Dispatch Date:</span>
                <input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  const exportRows = (reportData?.data || []).map((r) => ({
                    'Date': r.dispatch_date,
                    'Vehicle': r.vehicle_number,
                    'From': r.from_location,
                    'Destination': r.destination,
                    'Model Code': r.model_code,
                    'Model Name': r.model_name,
                    'Quantity': r.quantity,
                    'Status': r.status,
                    'Officer': r.employee_name,
                    'Remarks': r.remarks,
                  }));
                  handleExportToExcel(exportRows, `Jospo_Daily_Dispatch_${dispatchDate}`);
                }}
                disabled={loading || !reportData?.data?.length}
                className="btn-success text-xs py-2 px-4 inline-flex items-center space-x-2 shadow-sm"
              >
                <span>📥</span>
                <span>Export to Excel (.xlsx)</span>
              </button>
            </div>

            {/* Quick Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatsCard
                title="Date"
                value={dispatchDate}
                icon="📅"
                color="indigo"
                subtitle="Selected dispatch date"
              />
              <StatsCard
                title="Confirmed Units Dispatched"
                value={reportData?.total_confirmed_quantity ?? 0}
                icon="🚚"
                color="green"
                subtitle="Total coolers on vehicles"
              />
              <StatsCard
                title="Dispatch Movements"
                value={reportData?.data?.length ?? 0}
                icon="📦"
                color="purple"
                subtitle="Line item shipments"
              />
            </div>

            {/* Table */}
            <div className="card p-0 overflow-hidden border border-gray-200">
              {loading ? (
                <div className="py-16 text-center">
                  <LoadingSpinner message="Querying daily dispatches..." size="md" />
                </div>
              ) : !reportData?.data?.length ? (
                <div className="py-16 text-center text-gray-500 text-xs">
                  <div className="text-3xl mb-2">🚚</div>
                  <p className="font-semibold text-gray-700">No dispatches scheduled on {dispatchDate}</p>
                  <p className="mt-1">Try picking a different date or register a new dispatch with QR scanning.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Vehicle
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Destination
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Model
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-600 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Officer
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {reportData.data.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono font-bold text-gray-900">
                            {row.vehicle_number}
                          </td>
                          <td className="px-4 py-3 text-gray-800">
                            <span className="text-xs text-gray-500">{row.from_location} → </span>
                            <span className="font-medium text-gray-900">{row.destination}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono font-semibold text-primary-700">{row.model_code}</span>
                            <span className="block text-xs text-gray-500">{row.model_name}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">
                            {row.quantity} units
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={
                                row.status === 'confirmed'
                                  ? 'badge-success'
                                  : row.status === 'draft'
                                  ? 'badge-warning'
                                  : 'badge-danger'
                              }
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{row.employee_name}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900 text-xs sm:text-sm">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-left">
                          TOTAL CONFIRMED DISPATCH UNITS
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700 text-base">
                          {reportData.total_confirmed_quantity} units
                        </td>
                        <td colSpan={2} className="px-4 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. MONTHLY SUMMARY (PRODUCTION VS DISPATCH) */}
        {activeTab === 'monthly_summary' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Filter & Export Bar */}
            <div className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                <span className="font-semibold text-gray-700">Select Month:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:ring-1 focus:ring-primary-500"
                >
                  {monthNames.map((name, idx) => (
                    <option key={idx + 1} value={idx + 1}>
                      {name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium focus:ring-1 focus:ring-primary-500"
                >
                  {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  const exportRows = (reportData?.data || []).map((r) => ({
                    'Date': r.date,
                    'Production Units': r.production,
                    'Dispatch Units': r.dispatch,
                    'Net Inventory Change': r.net_change,
                  }));
                  handleExportToExcel(
                    exportRows,
                    `Jospo_Monthly_Summary_${monthNames[selectedMonth - 1]}_${selectedYear}`
                  );
                }}
                disabled={loading || !reportData?.data?.length}
                className="btn-success text-xs py-2 px-4 inline-flex items-center space-x-2 shadow-sm"
              >
                <span>📥</span>
                <span>Export to Excel (.xlsx)</span>
              </button>
            </div>

            {/* Monthly Total Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatsCard
                title="Total Monthly Production"
                value={reportData?.totals?.production ?? 0}
                icon="🏭"
                color="green"
                subtitle={`${monthNames[selectedMonth - 1]} ${selectedYear}`}
              />
              <StatsCard
                title="Total Monthly Dispatch"
                value={reportData?.totals?.dispatch ?? 0}
                icon="🚚"
                color="indigo"
                subtitle="Confirmed outward shipments"
              />
              <StatsCard
                title="Net Inventory Change"
                value={
                  (reportData?.totals?.net_change ?? 0) >= 0
                    ? `+${reportData?.totals?.net_change ?? 0}`
                    : `${reportData?.totals?.net_change ?? 0}`
                }
                icon="⚖️"
                color={(reportData?.totals?.net_change ?? 0) >= 0 ? 'blue' : 'amber'}
                subtitle="Production minus Dispatch"
              />
            </div>

            {/* Visual Bar Chart comparing Production vs Dispatch */}
            <div className="card p-5 border border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Daily Trend: Production vs Dispatch
                  </h3>
                  <p className="text-xs text-gray-500">
                    Day-by-day volume visualization for {monthNames[selectedMonth - 1]} {selectedYear}
                  </p>
                </div>
                <div className="flex items-center space-x-4 text-xs">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
                    <span className="text-gray-600">Production</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded bg-indigo-500 inline-block" />
                    <span className="text-gray-600">Dispatch</span>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="py-12 text-center">
                  <LoadingSpinner message="Generating trend chart..." size="sm" />
                </div>
              ) : (
                <div className="pt-6">
                  {/* Find max single day value for relative scaling */}
                  {(() => {
                    const maxVal = Math.max(
                      10,
                      ...(reportData?.data || []).map((d) => Math.max(d.production, d.dispatch))
                    );

                    return (
                      <div className="overflow-x-auto pb-2">
                        <div className="min-w-[650px] flex items-end justify-between h-48 border-b border-gray-200 px-2 gap-1.5">
                          {(reportData?.data || []).map((d) => {
                            const prodHeight = (d.production / maxVal) * 100;
                            const dispHeight = (d.dispatch / maxVal) * 100;

                            return (
                              <div
                                key={d.day}
                                className="flex-1 flex flex-col items-center group relative h-full justify-end"
                              >
                                {/* Tooltip hover */}
                                <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col items-center bg-gray-900 text-white text-[10px] py-1 px-2 rounded shadow-lg pointer-events-none whitespace-nowrap">
                                  <span>{d.date}</span>
                                  <span>Prod: {d.production} | Disp: {d.dispatch}</span>
                                </div>

                                <div className="w-full flex items-end justify-center space-x-0.5 h-full">
                                  {/* Production bar */}
                                  <div
                                    style={{ height: `${Math.max(prodHeight, d.production > 0 ? 4 : 0)}%` }}
                                    className="w-1/2 bg-emerald-500 rounded-t transition-all duration-300 hover:bg-emerald-600"
                                  />
                                  {/* Dispatch bar */}
                                  <div
                                    style={{ height: `${Math.max(dispHeight, d.dispatch > 0 ? 4 : 0)}%` }}
                                    className="w-1/2 bg-indigo-500 rounded-t transition-all duration-300 hover:bg-indigo-600"
                                  />
                                </div>
                                <span className="text-[10px] text-gray-400 mt-1.5 font-mono">
                                  {d.day}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Daily Summary Breakdown Table */}
            <div className="card p-0 overflow-hidden border border-gray-200">
              <div className="p-3.5 bg-gray-50 border-b border-gray-200">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                  Daily Breakdown Table
                </h4>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-600">Date</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-600">
                        Production (Units)
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-600">
                        Dispatch (Units)
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold text-gray-600">
                        Net Inventory Change
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {(reportData?.data || []).map((row) => (
                      <tr key={row.date} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{row.date}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                          {row.production > 0 ? `+${row.production}` : '0'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-indigo-700">
                          {row.dispatch > 0 ? `-${row.dispatch}` : '0'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold">
                          <span
                            className={
                              row.net_change > 0
                                ? 'text-emerald-700'
                                : row.net_change < 0
                                ? 'text-rose-700'
                                : 'text-gray-400'
                            }
                          >
                            {row.net_change > 0 ? `+${row.net_change}` : row.net_change}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900 text-xs sm:text-sm">
                    <tr>
                      <td className="px-4 py-3 text-left">MONTHLY TOTALS</td>
                      <td className="px-4 py-3 text-right text-emerald-700">
                        {reportData?.totals?.production ?? 0} units
                      </td>
                      <td className="px-4 py-3 text-right text-indigo-700">
                        {reportData?.totals?.dispatch ?? 0} units
                      </td>
                      <td className="px-4 py-3 text-right text-base text-primary-700">
                        {reportData?.totals?.net_change ?? 0} units
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 4. MODEL-WISE STOCK REPORT */}
        {activeTab === 'model_stock' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Filter & Export Bar */}
            <div className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Current Stock by Model</h3>
                <p className="text-xs text-gray-500">
                  Comprehensive audit of warehouse holdings and cumulative ledger totals
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const exportRows = (reportData?.data || []).map((r) => ({
                    'Model Code': r.model_code,
                    'Model Name': r.model_name,
                    'Current Stock': r.current_stock,
                    'All-Time Production': r.total_production_all_time,
                    'All-Time Dispatched': r.total_dispatch_all_time,
                    'All-Time Adjustments': r.net_adjustments_all_time,
                  }));
                  handleExportToExcel(exportRows, `Jospo_Model_Stock_Report_${todayStr}`);
                }}
                disabled={loading || !reportData?.data?.length}
                className="btn-success text-xs py-2 px-4 inline-flex items-center space-x-2 shadow-sm"
              >
                <span>📥</span>
                <span>Export to Excel (.xlsx)</span>
              </button>
            </div>

            {/* Table */}
            <div className="card p-0 overflow-hidden border border-gray-200">
              {loading ? (
                <div className="py-16 text-center">
                  <LoadingSpinner message="Calculating cumulative stock balances..." size="md" />
                </div>
              ) : !reportData?.data?.length ? (
                <div className="py-16 text-center text-gray-500 text-xs">
                  <div className="text-3xl mb-2">📋</div>
                  <p className="font-semibold text-gray-700">No cooler models found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Model Code
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Model Name
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">
                          Current Stock
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">
                          All-Time Production
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">
                          All-Time Dispatch
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">
                          Stock Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {reportData.data.map((row) => (
                        <tr key={row.model_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono font-bold text-primary-700">
                            {row.model_code}
                          </td>
                          <td className="px-4 py-3 text-gray-900 font-medium">{row.model_name}</td>
                          <td className="px-4 py-3 text-right font-extrabold text-gray-900 text-sm">
                            {row.current_stock} units
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-700 font-semibold">
                            {row.total_production_all_time}
                          </td>
                          <td className="px-4 py-3 text-right text-indigo-700 font-semibold">
                            {row.total_dispatch_all_time}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {row.current_stock <= 0 ? (
                              <span className="badge-danger">Out of Stock</span>
                            ) : row.current_stock <= 5 ? (
                              <span className="badge-warning">Low Stock ({row.current_stock})</span>
                            ) : (
                              <span className="badge-success">In Stock</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900 text-xs sm:text-sm">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-left">
                          TOTAL CURRENT WAREHOUSE STOCK
                        </td>
                        <td className="px-4 py-3 text-right text-base text-primary-700">
                          {(reportData?.data || []).reduce((acc, r) => acc + r.current_stock, 0)} units
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700">
                          {(reportData?.data || []).reduce((acc, r) => acc + r.total_production_all_time, 0)}
                        </td>
                        <td className="px-4 py-3 text-right text-indigo-700">
                          {(reportData?.data || []).reduce((acc, r) => acc + r.total_dispatch_all_time, 0)}
                        </td>
                        <td className="px-4 py-3" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
