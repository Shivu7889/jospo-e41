'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { exportToExcel } from '@/lib/exportExcel';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import StatsCard from '@/components/StatsCard';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { getTodayIST } from '@/lib/date';
import { usePlant } from '@/contexts/PlantContext';
import { ALL_PLANTS_ID } from '@/lib/plants';

export default function ReportsPage() {
  const { employee } = useAuth();
  const { showToast } = useToast();
  const { activePlant, isOwner } = usePlant();
  const isAdmin = employee?.role === 'admin' || employee?.role === 'owner' || isOwner;

  // Exactly 3 Tabs: 'production' | 'dispatch' | 'monthly_summary'
  const TABS = [
    { id: 'production', label: 'Production', icon: '🏭' },
    { id: 'dispatch', label: 'Dispatch', icon: '🚚' },
    { id: 'monthly_summary', label: 'Monthly Summary', icon: '📊' },
  ];

  const [activeTab, setActiveTab] = useState('production');

  // Date constants
  const todayStr = useMemo(() => getTodayIST(), []);
  const firstDayOfMonth = useMemo(() => getTodayIST().slice(0, 7) + '-01', []);

  // 1. Production Tab Filter States
  const [productionStartDate, setProductionStartDate] = useState(firstDayOfMonth);
  const [productionEndDate, setProductionEndDate] = useState(todayStr);
  const [selectedThekedar, setSelectedThekedar] = useState('all');
  const [selectedModel, setSelectedModel] = useState('all');
  const [thekedarContractorsList, setThekedarContractorsList] = useState([]);
  const [modelsList, setModelsList] = useState([]);

  // 2. Dispatch Tab Filter States
  const [dispatchStartDate, setDispatchStartDate] = useState(todayStr);
  const [dispatchEndDate, setDispatchEndDate] = useState(todayStr);

  // 3. Monthly Summary Tab Filter States
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Reassign Thekedar State (Admin only)
  const [editingRow, setEditingRow] = useState(null);
  const [editContractorName, setEditContractorName] = useState('');
  const [updatingContractor, setUpdatingContractor] = useState(false);

  // Data States
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);

  // Read URL query parameters on initial mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const thekedarParam = params.get('thekedar') || params.get('contractor');
      const modelParam = params.get('model') || params.get('model_id');

      if (tabParam) {
        if (tabParam === 'daily_production' || tabParam === 'thekedar_production' || tabParam === 'production') {
          setActiveTab('production');
        } else if (tabParam === 'daily_dispatch' || tabParam === 'dispatch') {
          setActiveTab('dispatch');
        } else if (tabParam === 'monthly_summary') {
          setActiveTab('monthly_summary');
        }
      }
      if (thekedarParam) {
        setSelectedThekedar(thekedarParam);
      }
      if (modelParam) {
        setSelectedModel(modelParam);
      }
    }
  }, []);

  // Quick Date Preset helper for Production
  const handleSetProductionDatePreset = (preset) => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
      const s = toYMD(today);
      setProductionStartDate(s);
      setProductionEndDate(s);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const s = toYMD(y);
      setProductionStartDate(s);
      setProductionEndDate(s);
    } else if (preset === 'this_week') {
      const d = new Date(today);
      const day = d.getDay() || 7; // Monday = 1
      d.setDate(d.getDate() - day + 1);
      setProductionStartDate(toYMD(d));
      setProductionEndDate(toYMD(today));
    } else if (preset === 'this_month') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      setProductionStartDate(toYMD(d));
      setProductionEndDate(toYMD(today));
    } else if (preset === 'last_month') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      setProductionStartDate(toYMD(start));
      setProductionEndDate(toYMD(end));
    } else if (preset === 'all') {
      setProductionStartDate('2024-01-01');
      setProductionEndDate(toYMD(today));
    }
  };

  // Quick Date Preset helper for Dispatch
  const handleSetDispatchDatePreset = (preset) => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
      const s = toYMD(today);
      setDispatchStartDate(s);
      setDispatchEndDate(s);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const s = toYMD(y);
      setDispatchStartDate(s);
      setDispatchEndDate(s);
    } else if (preset === 'this_week') {
      const d = new Date(today);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      setDispatchStartDate(toYMD(d));
      setDispatchEndDate(toYMD(today));
    } else if (preset === 'this_month') {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      setDispatchStartDate(toYMD(d));
      setDispatchEndDate(toYMD(today));
    } else if (preset === 'last_month') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      setDispatchStartDate(toYMD(start));
      setDispatchEndDate(toYMD(end));
    } else if (preset === 'all') {
      setDispatchStartDate('2024-01-01');
      setDispatchEndDate(toYMD(today));
    }
  };

  // Reset Production Filters
  const handleResetProductionFilters = () => {
    setProductionStartDate(firstDayOfMonth);
    setProductionEndDate(todayStr);
    setSelectedThekedar('all');
    setSelectedModel('all');
  };

  const isProductionFiltered =
    selectedThekedar !== 'all' ||
    selectedModel !== 'all' ||
    productionStartDate !== firstDayOfMonth ||
    productionEndDate !== todayStr;

  // Generic Export to Excel helper
  const handleExportToExcel = async (data, filename) => {
    try {
      if (!data || data.length === 0) {
        showToast('No data available to export.', 'warning');
        return;
      }
      await exportToExcel(data, filename, 'Report');
      showToast(`Exported ${filename}.xlsx successfully!`, 'success');
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      showToast('Failed to export to Excel: ' + err.message, 'error');
    }
  };

  // Export Production to Excel
  const handleExportProductionExcel = () => {
    try {
      const rows = reportData?.data || [];
      if (rows.length === 0) {
        showToast('No production data available to export.', 'warning');
        return;
      }

      const exportData = rows.map((r, idx) => ({
        'S.No': idx + 1,
        'Production Date': r.production_date,
        'Plant': r.plant || 'Main Plant',
        'Thekedar (Contractor)': r.contractor_name || r.thekedar_name || 'General / Unassigned',
        'Model Code': r.model_code,
        'Model Name': r.model_name,
        'Quantity (Units)': r.quantity,
        'Logged By': r.employee_name,
        'Remarks': r.remarks || '',
        'Created At': r.created_at ? new Date(r.created_at).toLocaleString() : '',
      }));

      const safeThekedar = selectedThekedar === 'all' ? 'All_Thekedars' : selectedThekedar.replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeModel = selectedModel === 'all'
        ? 'All_Models'
        : (modelsList.find((m) => String(m.id) === String(selectedModel))?.code || 'Model');
      const filename = `Jospo_Production_Report_${safeThekedar}_${safeModel}_${productionStartDate}_to_${productionEndDate}`;
      handleExportToExcel(exportData, filename);
    } catch (err) {
      console.error('Production Excel export error:', err);
      showToast('Export failed: ' + err.message, 'error');
    }
  };

  // Export Dispatch to Excel
  const handleExportDispatchExcel = () => {
    try {
      const rows = reportData?.data || [];
      if (rows.length === 0) {
        showToast('No dispatch data available to export.', 'warning');
        return;
      }

      const exportData = rows.map((r, idx) => ({
        'S.No': idx + 1,
        'Dispatch Date': r.dispatch_date,
        'Vehicle Number': r.vehicle_number,
        'From Plant': r.from_location,
        'Destination': r.destination,
        'Model Code': r.model_code,
        'Model Name': r.model_name,
        'Quantity (Units)': r.quantity,
        'Status': r.status,
        'Officer': r.employee_name,
        'Remarks': r.remarks || '',
      }));

      const filename = `Jospo_Dispatch_Report_${dispatchStartDate}_to_${dispatchEndDate}`;
      handleExportToExcel(exportData, filename);
    } catch (err) {
      console.error('Dispatch Excel export error:', err);
      showToast('Export failed: ' + err.message, 'error');
    }
  };

  // Export Monthly Summary to Excel
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handleExportMonthlyExcel = () => {
    try {
      const rows = reportData?.data || [];
      if (rows.length === 0) {
        showToast('No monthly summary data available to export.', 'warning');
        return;
      }

      const exportRows = rows.map((r) => ({
        'Date': r.date,
        'Production Units': r.production,
        'Dispatch Units': r.dispatch,
        'Net Inventory Change': r.net_change,
      }));
      handleExportToExcel(
        exportRows,
        `Jospo_Monthly_Summary_${monthNames[selectedMonth - 1]}_${selectedYear}`
      );
    } catch (err) {
      console.error('Monthly export error:', err);
      showToast('Export failed: ' + err.message, 'error');
    }
  };

  // Admin reassign Thekedar for a production entry
  const handleUpdateEntryContractor = async () => {
    if (!editingRow || !editContractorName.trim()) return;
    try {
      setUpdatingContractor(true);
      const res = await fetch('/api/production', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRow.id,
          contractor_name: editContractorName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update entry Thekedar');

      showToast(`Updated Thekedar to "${editContractorName.trim()}"!`, 'success');
      setEditingRow(null);
      await fetchReport(true);
    } catch (err) {
      console.error('Error updating entry Thekedar:', err);
      showToast(err.message || 'Error updating contractor', 'error');
    } finally {
      setUpdatingContractor(false);
    }
  };

  // Fetch Report Data from /api/reports (with SWR sessionStorage instant preview)
  const fetchReport = useCallback(async (forceRefresh = false) => {
    let url = `/api/reports?type=${activeTab}`;

    if (activeTab === 'production') {
      url += `&start_date=${productionStartDate}&end_date=${productionEndDate}&thekedar=${encodeURIComponent(selectedThekedar)}&model_id=${encodeURIComponent(selectedModel)}`;
    } else if (activeTab === 'dispatch') {
      url += `&start_date=${dispatchStartDate}&end_date=${dispatchEndDate}`;
    } else if (activeTab === 'monthly_summary') {
      url += `&month=${selectedMonth}&year=${selectedYear}`;
    }

    url += `&plant=${encodeURIComponent(activePlant)}`;
    const swrKey = `jospo_report_swr_${url}`;

    let hasSwr = false;
    if (!forceRefresh && typeof window !== 'undefined') {
      try {
        const cachedRaw = sessionStorage.getItem(swrKey);
        if (cachedRaw) {
          const cachedJson = JSON.parse(cachedRaw);
          setReportData(cachedJson);
          if (activeTab === 'production') {
            if (Array.isArray(cachedJson.thekedar_list)) setThekedarContractorsList(cachedJson.thekedar_list);
            if (Array.isArray(cachedJson.models_list)) setModelsList(cachedJson.models_list);
          }
          hasSwr = true;
        }
      } catch (e) {}
    }

    try {
      if (!hasSwr) setLoading(true);
      const fetchUrl = forceRefresh ? `${url}&refresh=true` : url;
      const res = await fetch(fetchUrl);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch report');
      }

      setReportData(json);

      if (activeTab === 'production') {
        if (json.thekedar_list && Array.isArray(json.thekedar_list)) {
          setThekedarContractorsList(json.thekedar_list);
        } else if (json.summary?.thekedar_list && Array.isArray(json.summary.thekedar_list)) {
          setThekedarContractorsList(json.summary.thekedar_list);
        }
        if (json.models_list && Array.isArray(json.models_list)) {
          setModelsList(json.models_list);
        }
      }

      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(swrKey, JSON.stringify(json));
        } catch (e) {}
      }
    } catch (err) {
      console.error('Error fetching report:', err);
      showToast(err.message || 'Error generating report', 'error');
    } finally {
      setLoading(false);
    }
  }, [
    activeTab,
    productionStartDate,
    productionEndDate,
    selectedThekedar,
    selectedModel,
    dispatchStartDate,
    dispatchEndDate,
    selectedMonth,
    selectedYear,
    activePlant,
    showToast,
  ]);

  useEffect(() => {
    fetchReport(false);
  }, [fetchReport]);

  const selectedModelObj = useMemo(() => {
    if (selectedModel === 'all') return null;
    return modelsList.find((m) => String(m.id) === String(selectedModel));
  }, [selectedModel, modelsList]);

  return (
    <AppShell allowedRoles={['admin', 'owner']}>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                Manufacturing & Stock Reports
              </h1>
              {activePlant === ALL_PLANTS_ID ? (
                <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                  🌐 Consolidated (All 3 Plants)
                </span>
              ) : (
                <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                  🏭 Plant: {activePlant}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-600">
              Complete production auditing, dispatch tracking, and monthly reconciliation spreadsheets.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => fetchReport(true)}
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

        {/* Tab Navigation (EXACTLY 3 TABS) */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-3 sm:space-x-6 overflow-x-auto" aria-label="Reports tabs">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`whitespace-nowrap pb-3.5 px-3 sm:px-5 border-b-2 text-sm sm:text-base font-bold flex items-center space-x-2.5 transition-all ${
                    active
                      ? 'border-primary-600 text-primary-700 bg-primary-50/30 rounded-t-lg'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="text-lg">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* ========================================================================= */}
        {/* 1. PRODUCTION REPORT (Date, Thekedar, Model Filters)                       */}
        {/* ========================================================================= */}
        {activeTab === 'production' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Filter & Action Toolbar */}
            <div className="card p-5 border border-gray-200 shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* 3 Main Filters: Date, Thekedar, Model */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
                  {/* Filter 1: Thekedar (Contractor) */}
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

                  {/* Filter 2: Model-wise */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      📦 Model Wise
                    </label>
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm font-semibold bg-white text-gray-900 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="all">📦 All Models (Entire Catalog)</option>
                      {modelsList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.code ? `[${m.code}] ` : ''}{m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filter 3: From Date */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      📅 From Date
                    </label>
                    <input
                      type="date"
                      value={productionStartDate}
                      onChange={(e) => setProductionStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  {/* Filter 4: To Date */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      📅 To Date
                    </label>
                    <input
                      type="date"
                      value={productionEndDate}
                      onChange={(e) => setProductionEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Actions & Export */}
                <div className="flex flex-wrap items-center gap-2 pt-1 lg:pt-0">
                  {isProductionFiltered && (
                    <button
                      type="button"
                      onClick={handleResetProductionFilters}
                      className="btn-secondary text-xs py-2.5 px-3 inline-flex items-center space-x-1 shadow-sm font-medium text-rose-700 hover:bg-rose-50 border-rose-200"
                      title="Reset all filters back to default month range and all models/thekedars"
                    >
                      <span>🔄</span>
                      <span>Reset Filters</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleExportProductionExcel}
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
                <span className="text-xs font-bold text-gray-500">Quick Date Presets:</span>
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
                    onClick={() => handleSetProductionDatePreset(p.key)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
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
                value={`${(reportData?.total_quantity || reportData?.summary?.total_quantity || 0).toLocaleString()} units`}
                icon="❄️"
                color="indigo"
                subtitle={`${productionStartDate} to ${productionEndDate}`}
              />
              <StatsCard
                title="Thekedars Active"
                value={reportData?.thekedar_count || reportData?.summary?.thekedar_count || 0}
                icon="👷"
                color="amber"
                subtitle={selectedThekedar === 'all' ? 'All active contractors' : selectedThekedar}
              />
              <StatsCard
                title="Production Batches"
                value={reportData?.total_entries || reportData?.summary?.total_entries || 0}
                icon="📋"
                color="emerald"
                subtitle="Recorded assembly logs"
              />
              <StatsCard
                title="Active Filter Scope"
                value={selectedThekedar !== 'all' ? selectedThekedar : selectedModelObj ? selectedModelObj.code : 'All Factory'}
                icon="🔍"
                color="blue"
                subtitle={
                  selectedModelObj
                    ? `Model: ${selectedModelObj.code}`
                    : selectedThekedar !== 'all'
                    ? 'Filtered Thekedar'
                    : 'Factory cumulative'
                }
              />
            </div>

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
                      Period: <span className="font-semibold">{productionStartDate}</span> to{' '}
                      <span className="font-semibold">{productionEndDate}</span>
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setSelectedThekedar('all')}
                      className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 shadow-sm"
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
                        Model Wise Assembled Units by {selectedThekedar}:
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {Object.entries(contractorSummary.models).map(([modelKey, m]) => {
                          const code = typeof m === 'object' ? (m.code || modelKey) : modelKey;
                          const name = typeof m === 'object' ? (m.name || code) : 'Units';
                          const qty = typeof m === 'object' ? (m.quantity || 0) : m;
                          return (
                            <div key={code} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm">
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

            {/* Model Summary Breakdown Cards */}
            {reportData?.by_model?.length > 0 && (
              <div className="card p-5 border border-gray-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-gray-900 flex items-center space-x-2">
                      <span>📦 Model-wise Assembled Breakdown</span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Units produced per cooler model in selected date range. Click any model to isolate.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-primary-700 bg-primary-50 border border-primary-200 px-2.5 py-1 rounded-full">
                    {reportData.by_model.length} Models
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                  {(reportData.by_model || []).map((m) => {
                    const isCurrent =
                      selectedModelObj && (selectedModelObj.code === m.model_code || selectedModelObj.name === m.model_name);
                    return (
                      <div
                        key={m.model_code}
                        onClick={() => {
                          const found = modelsList.find((mod) => mod.code === m.model_code || mod.name === m.model_name);
                          if (found) {
                            setSelectedModel(String(found.id));
                          }
                        }}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          isCurrent
                            ? 'border-primary-500 bg-primary-50/70 shadow-sm ring-2 ring-primary-400'
                            : 'border-gray-200 bg-white hover:border-primary-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs text-primary-700 truncate">{m.model_code}</span>
                          <span className="text-[10px] text-gray-400 font-semibold">{m.entry_count} logs</span>
                        </div>
                        <p className="text-[11px] text-gray-600 truncate mt-0.5" title={m.model_name}>
                          {m.model_name}
                        </p>
                        <p className="text-base font-extrabold text-gray-900 font-mono mt-1">
                          {(m.total_quantity || 0).toLocaleString()} <span className="text-[10px] font-normal text-gray-500">units</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Contractor Summary Cards (When viewing 'all' thekedars) */}
            {selectedThekedar === 'all' && reportData?.by_thekedar?.length > 0 && (
              <div className="card p-5 border border-gray-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-gray-900 flex items-center space-x-2">
                      <span>👷 Thekedar Performance Breakdown</span>
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Coolers assembled per contractor between {productionStartDate} and {productionEndDate}. Click to filter.
                    </p>
                  </div>
                  <span className="text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full">
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
                                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-white text-gray-800 border border-amber-200 shadow-sm"
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

            {/* Detailed Production Entries Table */}
            <div className="card p-0 overflow-hidden border border-gray-200 shadow-sm">
              <div className="p-4 bg-gray-50/80 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-2">
                    <span>📋 Detailed Production Entries Log</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Individual assembly logs matching selected Thekedar, Model, and Date filters.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-gray-700 bg-white px-3 py-1 rounded-lg border border-gray-200 shadow-sm">
                    Showing {reportData?.data?.length || 0} entries
                  </span>
                  <Link
                    href={`/production?date=${encodeURIComponent(productionEndDate || todayStr)}&thekedar=${selectedThekedar !== 'all' ? encodeURIComponent(selectedThekedar) : ''}`}
                    className="inline-flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-sm transition-colors active:scale-95"
                    title="Open Production screen to add any missed models"
                  >
                    <span>➕</span>
                    <span>Add Missed Model</span>
                  </Link>
                </div>
              </div>

              {loading ? (
                <div className="py-16 text-center">
                  <LoadingSpinner message="Loading production entries..." size="md" />
                </div>
              ) : !reportData?.data?.length ? (
                <div className="py-16 text-center text-gray-500 text-xs">
                  <div className="text-3xl mb-2">🏭</div>
                  <p className="font-semibold text-gray-700">No production entries found for this selection.</p>
                  <p className="text-gray-400 mt-1">
                    Try selecting a wider date range, "All Thekedars", or "All Models".
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
                            <div className="flex items-center space-x-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                                👷 {row.contractor_name || row.thekedar_name || 'General / Unassigned'}
                              </span>
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingRow(row);
                                    setEditContractorName(row.contractor_name || (thekedarContractorsList[0] || ''));
                                  }}
                                  className="text-gray-400 hover:text-amber-700 hover:bg-amber-100 p-1 rounded transition-colors text-xs"
                                  title="Admin: Change Thekedar for this entry"
                                >
                                  ✏️
                                </button>
                              )}
                            </div>
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
                          {selectedThekedar === 'all' ? 'All Thekedars' : selectedThekedar}
                          {selectedModelObj ? ` • ${selectedModelObj.code}` : ''})
                        </td>
                        <td className="px-4 py-3 text-right text-base text-emerald-700 font-mono font-extrabold">
                          {(reportData?.total_quantity || reportData?.summary?.total_quantity || 0).toLocaleString()} units
                        </td>
                        <td colSpan={2} className="px-4 py-3 text-right text-gray-500 text-xs">
                          {reportData?.total_entries || reportData?.summary?.total_entries || 0} batches recorded
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Admin Reassign Contractor Modal */}
            {isAdmin && editingRow && (
              <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center space-x-1.5">
                      <span>👷 Reassign Thekedar</span>
                      <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded-full uppercase">Admin</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingRow(null)}
                      className="text-gray-400 hover:text-gray-600 text-sm font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-xl text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Date:</span>
                      <span className="font-semibold">{editingRow.production_date}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Model:</span>
                      <span className="font-semibold">{editingRow.model_code} - {editingRow.model_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Quantity:</span>
                      <span className="font-extrabold text-emerald-700">+{editingRow.quantity} units</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Current Thekedar:</span>
                      <span className="font-bold text-amber-800">{editingRow.contractor_name || 'General / Unassigned'}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 block">Select New Thekedar:</label>
                    <select
                      value={editContractorName}
                      onChange={(e) => setEditContractorName(e.target.value)}
                      className="input-field text-xs bg-white font-semibold text-gray-900"
                    >
                      {thekedarContractorsList.map((t) => (
                        <option key={t} value={t}>👷 {t}</option>
                      ))}
                    </select>

                    <div className="pt-2">
                      <span className="text-[11px] text-gray-500 block mb-1">Or type a specific name:</span>
                      <input
                        type="text"
                        value={editContractorName}
                        onChange={(e) => setEditContractorName(e.target.value)}
                        placeholder="e.g. Ramesh"
                        className="input-field text-xs bg-white font-medium"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setEditingRow(null)}
                      disabled={updatingContractor}
                      className="btn-secondary text-xs py-2 px-3"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleUpdateEntryContractor}
                      disabled={updatingContractor || !editContractorName.trim()}
                      className="btn-primary text-xs py-2 px-4 shadow-sm font-bold"
                    >
                      {updatingContractor ? 'Updating...' : 'Save Reassignment'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. DISPATCH REPORT (Date Range Filter + Vehicles / Items Breakdown)       */}
        {/* ========================================================================= */}
        {activeTab === 'dispatch' && (
          <div className="space-y-5 animate-fadeIn">
            {/* Filter & Export Bar */}
            <div className="card p-4 border border-gray-200 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                  <span className="font-bold text-gray-700">Dispatch Period:</span>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-gray-500 text-xs">From:</span>
                    <input
                      type="date"
                      value={dispatchStartDate}
                      onChange={(e) => setDispatchStartDate(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm font-medium focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-gray-500 text-xs">To:</span>
                    <input
                      type="date"
                      value={dispatchEndDate}
                      onChange={(e) => setDispatchEndDate(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm font-medium focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportDispatchExcel}
                  disabled={loading || !reportData?.data?.length}
                  className="btn-success text-xs py-2.5 px-4 inline-flex items-center space-x-2 shadow-sm font-bold"
                >
                  <span>📥</span>
                  <span>Export to Excel (.xlsx)</span>
                </button>
              </div>

              {/* Quick Date Presets */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                <span className="text-xs font-semibold text-gray-500">Quick Presets:</span>
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
                    onClick={() => handleSetDispatchDatePreset(p.key)}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatsCard
                title="Dispatch Period"
                value={dispatchStartDate === dispatchEndDate ? dispatchStartDate : `${dispatchStartDate} to ${dispatchEndDate}`}
                icon="📅"
                color="indigo"
                subtitle="Selected dispatch date range"
              />
              <StatsCard
                title="Confirmed Units Dispatched"
                value={`${(reportData?.total_confirmed_quantity ?? 0).toLocaleString()} units`}
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
            <div className="card p-0 overflow-hidden border border-gray-200 shadow-sm">
              {loading ? (
                <div className="py-16 text-center">
                  <LoadingSpinner message="Querying dispatches..." size="md" />
                </div>
              ) : !reportData?.data?.length ? (
                <div className="py-16 text-center text-gray-500 text-xs">
                  <div className="text-3xl mb-2">🚚</div>
                  <p className="font-semibold text-gray-700">No dispatches found for this period.</p>
                  <p className="mt-1">Try picking a wider date range or register a new dispatch with QR scanning.</p>
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
                        <td className="px-4 py-3 text-right text-emerald-700 text-base font-mono">
                          {(reportData?.total_confirmed_quantity || 0).toLocaleString()} units
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

        {/* ========================================================================= */}
        {/* 3. MONTHLY SUMMARY (Production vs Dispatch Trend & Daily Reconciliation)   */}
        {/* ========================================================================= */}
        {activeTab === 'monthly_summary' && (
          <div className="space-y-6 animate-fadeIn">
            {/* Filter & Export Bar */}
            <div className="card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border border-gray-200 shadow-sm">
              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                <span className="font-bold text-gray-700">Select Month:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-semibold focus:ring-1 focus:ring-primary-500 bg-white"
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
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-semibold focus:ring-1 focus:ring-primary-500 bg-white"
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
                onClick={handleExportMonthlyExcel}
                disabled={loading || !reportData?.data?.length}
                className="btn-success text-xs py-2 px-4 inline-flex items-center space-x-2 shadow-sm font-bold"
              >
                <span>📥</span>
                <span>Export to Excel (.xlsx)</span>
              </button>
            </div>

            {/* Monthly Total Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatsCard
                title="Total Monthly Production"
                value={`${(reportData?.totals?.production ?? 0).toLocaleString()} units`}
                icon="🏭"
                color="green"
                subtitle={`${monthNames[selectedMonth - 1]} ${selectedYear}`}
              />
              <StatsCard
                title="Total Monthly Dispatch"
                value={`${(reportData?.totals?.dispatch ?? 0).toLocaleString()} units`}
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
            <div className="card p-5 border border-gray-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Daily Trend: Production vs Dispatch
                  </h3>
                  <p className="text-xs text-gray-500">
                    Day-by-day volume visualization for {monthNames[selectedMonth - 1]} {selectedYear}
                  </p>
                </div>
                <div className="flex items-center space-x-4 text-xs font-semibold">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
                    <span className="text-gray-700">Production</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-3 h-3 rounded bg-indigo-500 inline-block" />
                    <span className="text-gray-700">Dispatch</span>
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
            <div className="card p-0 overflow-hidden border border-gray-200 shadow-sm">
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
                      <td className="px-4 py-3 text-right text-emerald-700 font-mono">
                        {(reportData?.totals?.production ?? 0).toLocaleString()} units
                      </td>
                      <td className="px-4 py-3 text-right text-indigo-700 font-mono">
                        {(reportData?.totals?.dispatch ?? 0).toLocaleString()} units
                      </td>
                      <td className="px-4 py-3 text-right text-base text-primary-700 font-mono">
                        {(reportData?.totals?.net_change ?? 0).toLocaleString()} units
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
