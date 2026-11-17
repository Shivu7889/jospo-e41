'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatsCard from '@/components/StatsCard';
import { useToast } from '@/components/Toast';

export default function ReportsPage() {
  const { showToast } = useToast();

  // Active Tab: 'thekedar_production' | 'daily_production' | 'daily_dispatch' | 'monthly_summary' | 'model_stock'
  const [activeTab, setActiveTab] = useState('daily_production');

  // Filter States
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [productionDate, setProductionDate] = useState(todayStr);
  const [dispatchDate, setDispatchDate] = useState(todayStr);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Thekedar (Contractor) Report Filter States
  const firstDayOfMonth = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  }, []);
  const [thekedarStartDate, setThekedarStartDate] = useState(firstDayOfMonth);
  const [thekedarEndDate, setThekedarEndDate] = useState(todayStr);
  const [selectedThekedar, setSelectedThekedar] = useState('all');
  const [thekedarContractorsList, setThekedarContractorsList] = useState([]);

  // Data States
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);

  // Read URL query parameters on initial mount (e.g. /reports?tab=thekedar_production&thekedar=Ramesh)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const thekedarParam = params.get('thekedar') || params.get('contractor');
      if (tabParam) {
        setActiveTab(tabParam);
      }
      if (thekedarParam) {
        setSelectedThekedar(thekedarParam);
      }
    }
  }, []);

  // Quick Date Preset handler for Thekedar report
  const handleSetDatePreset = (preset) => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
      const s = toYMD(today);
      setThekedarStartDate(s);
      setThekedarEndDate(s);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const s = toYMD(y);
      setThekedarStartDate(s);
      setThekedarEndDate(s);
    } else if (preset === 'this_week') {
      const d = new Date(today);
      const day = d.getDay() || 7; // Monday = 1
      d.setDate(d.getDate() - day + 1);
      setThekedarStartDate(toYMD(d));
      setThekedarEndDate(toYMD(today));
    } else if (preset === 'this_month') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      setThekedarStartDate(toYMD(d));
      setThekedarEndDate(toYMD(today));
    } else if (preset === 'last_month') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      setThekedarStartDate(toYMD(start));
      setThekedarEndDate(toYMD(end));
    } else if (preset === 'all') {
      setThekedarStartDate('2024-01-01');
      setThekedarEndDate(toYMD(today));
    }
  };

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

  // Export Thekedar Production to Excel
  const handleExportThekedarExcel = () => {
    try {
      const rows = reportData?.data || [];
      if (rows.length === 0) {
        showToast('No Thekedar production data available to export.', 'warning');
        return;
      }

      const exportData = rows.map((r, idx) => ({
        'S.No': idx + 1,
        'Thekedar (Contractor)': r.contractor_name || 'General / Unassigned',
        'Production Date': r.production_date,
        'Model Code': r.model_code,
        'Model Name': r.model_name,
        'Quantity (Units)': r.quantity,
        'Logged By': r.employee_name,
        'Remarks': r.remarks || '',
        'Created At': r.created_at ? new Date(r.created_at).toLocaleString() : '',
      }));

      const safeThekedar = selectedThekedar === 'all' ? 'All_Thekedars' : selectedThekedar.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `Jospo_Thekedar_Production_${safeThekedar}_${thekedarStartDate}_to_${thekedarEndDate}`;
      handleExportToExcel(exportData, filename);
    } catch (err) {
      console.error('Thekedar Excel export error:', err);
      showToast('Export failed: ' + err.message, 'error');
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
      } else if (activeTab === 'thekedar_production') {
        url += `&start_date=${thekedarStartDate}&end_date=${thekedarEndDate}&thekedar=${encodeURIComponent(selectedThekedar)}`;
      }

      const res = await fetch(url);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch report');
      }

      setReportData(json);

      if (activeTab === 'thekedar_production' && json.summary?.thekedar_list) {
        setThekedarContractorsList(json.summary.thekedar_list);
      }
    } catch (err) {
      console.error('Error fetching report:', err);
      showToast(err.message || 'Error generating report', 'error');
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    productionDate,
    dispatchDate,
    selectedMonth,
    selectedYear,
    thekedarStartDate,
    thekedarEndDate,
    selectedThekedar,
    showToast,
  ]);

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
              { id: 'thekedar_production', label: 'Thekedar Production', icon: '👷' },
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

        {/* 0. THEKEDAR (CONTRACTOR) PRODUCTION REPORT */}
        {activeTab === 'thekedar_production' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Filter & Action Toolbar */}
            <div className="card p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
                  {/* Thekedar Dropdown */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      👷 Thekedar (Contractor)
                    </label>
                    <select
                      value={selectedThekedar}
                      onChange={(e) => setSelectedThekedar(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm font-semibold bg-white text-gray-900 focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                    >
                      <option value="all">👥 All Thekedars (Entire Factory)</option>
                      {thekedarContractorsList.map((t) => (
                        <option key={t} value={t}>
                          👷 {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Start Date */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      📅 From Date
                    </label>
                    <input
                      type="date"
                      value={thekedarStartDate}
                      onChange={(e) => setThekedarStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* End Date */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      📅 To Date
                    </label>
                    <input
                      type="date"
                      value={thekedarEndDate}
                      onChange={(e) => setThekedarEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2 pt-1 lg:pt-0">
                  <button
                    type="button"
                    onClick={handleExportThekedarExcel}
                    disabled={loading || !reportData?.data?.length}
                    className="btn-success text-xs py-2.5 px-4 inline-flex items-center space-x-2 shadow-sm font-bold"
                  >
                    <span>📥</span>
                    <span>Download Excel (.xlsx)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    disabled={loading || !reportData?.data?.length}
                    className="btn-secondary text-xs py-2.5 px-3 inline-flex items-center space-x-1.5 shadow-sm font-medium"
                    title="Print Statement / Slip"
                  >
                    <span>🖨️</span>
                    <span>Print Slip</span>
                  </button>
                </div>
              </div>

              {/* Quick Date Presets */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-500">Quick Range:</span>
                {[
                  { label: 'Today', key: 'today' },
                  { label: 'Yesterday', key: 'yesterday' },
                  { label: 'This Week', key: 'this_week' },
                  { label: 'This Month', key: 'this_month' },
                  { label: 'Last Month', key: 'last_month' },
                  { label: 'All Time', key: 'all' },
                ].map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => handleSetDatePreset(p.key)}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Total Coolers Assembled"
                value={`${(reportData?.summary?.total_quantity || 0).toLocaleString()} units`}
                icon="❄️"
                color="indigo"
                subtitle={`${thekedarStartDate} to ${thekedarEndDate}`}
              />
              <StatsCard
                title="Thekedars Active"
                value={reportData?.summary?.thekedar_count || 0}
                icon="👷"
                color="amber"
                subtitle={selectedThekedar === 'all' ? 'All active contractors' : selectedThekedar}
              />
              <StatsCard
                title="Production Batches"
                value={reportData?.summary?.total_entries || 0}
                icon="📋"
                color="emerald"
                subtitle="Recorded assembly logs"
              />
              <StatsCard
                title="Contractor Selected"
                value={selectedThekedar === 'all' ? 'All (Factory)' : selectedThekedar}
                icon="🏭"
                color="blue"
                subtitle={selectedThekedar !== 'all' ? 'Filtered view' : 'Cumulative'}
              />
            </div>

            {/* Contractor Summary Cards (When viewing 'all') */}
            {selectedThekedar === 'all' && reportData?.by_thekedar?.length > 0 && (
              <div className="card p-5 border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                      <span>👷 Contractor Summary Breakdown</span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Coolers assembled per Thekedar between {thekedarStartDate} and {thekedarEndDate}. Click any contractor to filter.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full">
                    {reportData.by_thekedar.length} Contractors
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(reportData.by_thekedar || []).map((c, cIdx) => {
                    const cName = c?.contractor_name || c?.thekedar_name || 'General / Unassigned';
                    return (
                      <div
                        key={cName + cIdx}
                        className="p-4 rounded-xl border border-amber-200/80 bg-amber-50/40 hover:bg-amber-50/80 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-900 text-sm flex items-center space-x-1.5">
                              <span>👷</span>
                              <span>{cName}</span>
                            </span>
                            <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                              {c.entries_count || c.entry_count || 0} logs
                            </span>
                          </div>

                          <div className="mt-3">
                            <span className="text-2xl font-extrabold text-amber-900 font-mono">
                              {(c.total_quantity || 0).toLocaleString()}
                            </span>
                            <span className="text-xs font-medium text-gray-500 ml-1.5">assembled coolers</span>
                          </div>

                          {/* Model breakdown chips */}
                          <div className="mt-3 space-y-1.5 border-t border-amber-100 pt-2.5">
                            <span className="text-[11px] font-bold text-gray-600 block uppercase">
                              Model Breakdown:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(c.models || {}).map(([modelKey, m]) => {
                                const code = typeof m === 'object' ? (m.code || modelKey) : modelKey;
                                const qty = typeof m === 'object' ? m.quantity : m;
                                return (
                                  <span
                                    key={code}
                                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-white text-gray-800 border border-amber-200 shadow-2xs"
                                  >
                                    <span className="font-bold text-primary-700 mr-1">{code}:</span>
                                    <span>{qty}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-amber-100 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => setSelectedThekedar(cName)}
                            className="text-xs font-bold text-primary-700 hover:text-primary-800 hover:underline flex items-center space-x-1"
                          >
                            <span>Filter to {cName}</span>
                            <span>→</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Contractor Settlement Slip View (When single contractor is chosen) */}
            {selectedThekedar !== 'all' && (
              <div className="card p-5 border-2 border-amber-300 bg-gradient-to-r from-amber-50/50 via-white to-amber-50/30 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-amber-200/80 pb-3">
                  <div>
                    <span className="text-xs font-bold tracking-wider uppercase text-amber-700">
                      Contractor Assembly Statement & Slip
                    </span>
                    <h2 className="text-xl font-extrabold text-gray-900 flex items-center space-x-2 mt-0.5">
                      <span>👷</span>
                      <span>{selectedThekedar}</span>
                    </h2>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Period: <span className="font-semibold">{thekedarStartDate}</span> to{' '}
                      <span className="font-semibold">{thekedarEndDate}</span>
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setSelectedThekedar('all')}
                      className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-2xs"
                    >
                      ← Back to All Thekedars
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-sm inline-flex items-center space-x-1"
                    >
                      <span>🖨️</span>
                      <span>Print Slip</span>
                    </button>
                  </div>
                </div>

                {/* Model Wise Summary for this contractor */}
                {(() => {
                  const target = (selectedThekedar || '').toLowerCase().trim();
                  const contractorSummary = (reportData?.by_thekedar || []).find((c) => {
                    const name = (c?.contractor_name || c?.thekedar_name || '').toLowerCase().trim();
                    return name === target;
                  });

                  if (!contractorSummary || !contractorSummary.models) return null;

                  return (
                    <div>
                      <h4 className="text-xs font-bold text-gray-700 uppercase mb-2">
                        Model Wise Assembled Units:
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {Object.entries(contractorSummary.models).map(([modelKey, m]) => {
                          const code = typeof m === 'object' ? (m.code || modelKey) : modelKey;
                          const name = typeof m === 'object' ? (m.name || code) : 'Units';
                          const qty = typeof m === 'object' ? (m.quantity || 0) : m;
                          return (
                            <div key={code} className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs">
                              <span className="font-mono font-bold text-xs text-primary-700">{code}</span>
                              <p className="text-xs text-gray-500 truncate">{name}</p>
                              <p className="text-lg font-extrabold text-gray-900 mt-1 font-mono">{qty} units</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Detailed Production Entries Table */}
            <div className="card p-0 overflow-hidden border border-gray-200 shadow-sm">
              <div className="p-4 bg-gray-50/80 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-2">
                    <span>📋 Detailed Production Entries Log</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Individual assembly records matching selected Thekedar and date range.
                  </p>
                </div>
                <span className="text-xs font-bold text-gray-700 bg-white px-3 py-1 rounded-lg border border-gray-200 shadow-2xs">
                  Showing {reportData?.data?.length || 0} entries
                </span>
              </div>

              {loading ? (
                <div className="py-16 text-center">
                  <LoadingSpinner message="Loading Thekedar production records..." size="md" />
                </div>
              ) : !reportData?.data?.length ? (
                <div className="py-16 text-center text-gray-500 text-xs">
                  <div className="text-3xl mb-2">👷</div>
                  <p className="font-semibold text-gray-700">No production entries found for this selection.</p>
                  <p className="text-gray-400 mt-1">
                    Try selecting a wider date range or "All Thekedars".
                  </p>
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
                          Date
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Thekedar (Contractor)
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Cooler Model
                        </th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-600 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Logged By
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">
                          Remarks / Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {reportData.data.map((row, idx) => (
                        <tr key={row.id || idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs">{idx + 1}</td>
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                            {row.production_date}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                              👷 {row.contractor_name || 'General / Unassigned'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-mono font-bold text-xs text-primary-700 bg-primary-50 px-2 py-0.5 rounded border border-primary-100">
                                {row.model_code}
                              </span>
                              <span className="text-xs text-gray-700 font-medium truncate max-w-xs">
                                {row.model_name}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                              +{Number(row.quantity).toLocaleString()} units
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                            {row.employee_name || 'Supervisor'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs italic max-w-xs truncate">
                            {row.remarks || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-900 text-xs sm:text-sm">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-left uppercase">
                          TOTAL UNITS ASSEMBLED (
                          {selectedThekedar === 'all' ? 'All Thekedars' : selectedThekedar})
                        </td>
                        <td className="px-4 py-3 text-right text-base text-emerald-700 font-mono font-extrabold">
                          {(reportData?.summary?.total_quantity || 0).toLocaleString()} units
                        </td>
                        <td colSpan={2} className="px-4 py-3 text-right text-gray-500 text-xs">
                          {reportData?.summary?.total_entries || 0} batches recorded
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

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
