'use client';

import { useState, useEffect, useCallback, useId } from 'react';
import AppShell from '@/components/AppShell';
import LoadingSpinner from '@/components/LoadingSpinner';
import DataTable from '@/components/DataTable';
import QRGenerator from '@/components/QRGenerator';
import { useToast } from '@/components/Toast';

export default function ModelsPage() {
  const { showToast } = useToast();

  // Model Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [qrData, setQrData] = useState('');
  const [manufacturingPlant, setManufacturingPlant] = useState('E41 G2');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [qrManuallyEdited, setQrManuallyEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Models List State
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [plantFilter, setPlantFilter] = useState('ALL');
  const [filterActiveOnly, setFilterActiveOnly] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // QR Modal State
  const [qrModalModel, setQrModalModel] = useState(null);

  // Edit Model State
  const [editingModel, setEditingModel] = useState(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editQrData, setEditQrData] = useState('');
  const [editManufacturingPlant, setEditManufacturingPlant] = useState('E41 G2');
  const [savingEdit, setSavingEdit] = useState(false);

  // Helper to generate code from name
  const generateCodeFromName = (modelName) => {
    if (!modelName) return '';
    // E.g. "Jospo J-50 Super" -> "J-50" or "J50"
    let clean = modelName.trim().toUpperCase();
    clean = clean.replace(/^JOSPO\s+/i, '');
    clean = clean.replace(/[^A-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return clean || 'MODEL';
  };

  // Helper to generate QR data from code
  const generateQrFromCode = (modelCode) => {
    if (!modelCode) return '';
    const clean = modelCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return `JOSPO-${clean}`;
  };

  // Name change handler
  const handleNameChange = (e) => {
    const newName = e.target.value;
    setName(newName);

    if (!codeManuallyEdited) {
      const generatedCode = generateCodeFromName(newName);
      setCode(generatedCode);
      if (!qrManuallyEdited) {
        setQrData(generateQrFromCode(generatedCode));
      }
    }
  };

  // Code change handler
  const handleCodeChange = (e) => {
    const newCode = e.target.value.toUpperCase();
    setCode(newCode);
    setCodeManuallyEdited(true);

    if (!qrManuallyEdited) {
      setQrData(generateQrFromCode(newCode));
    }
  };

  // QR data change handler
  const handleQrChange = (e) => {
    setQrData(e.target.value);
    setQrManuallyEdited(true);
  };

  // Fetch models from API
  const fetchModels = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const url = `/api/models?active_only=${filterActiveOnly}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load cooler models');
      }

      setModels(data.models || []);
    } catch (err) {
      console.error('Error fetching models:', err);
      showToast(err.message || 'Error loading models', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filterActiveOnly]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Form submit handler
  const handleCreateModel = async (e) => {
    e.preventDefault();

    if (!name.trim()) {
      showToast('Please enter a model name.', 'warning');
      return;
    }
    if (!code.trim()) {
      showToast('Please provide a model code.', 'warning');
      return;
    }
    if (!qrData.trim()) {
      showToast('QR Data is required.', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          description: description.trim() || null,
          qr_data: qrData.trim(),
          manufacturing_plant: manufacturingPlant,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to create model');
      }

      showToast(`Model "${result.model.code}" created successfully for ${manufacturingPlant}!`, 'success');

      // Optimistically add the new model immediately to the list
      if (result.model) {
        setModels((prev) => {
          const exists = prev.some((m) => m.id === result.model.id);
          if (exists) return prev;
          return [result.model, ...prev];
        });
      }

      // Reset form
      setName('');
      setCode('');
      setDescription('');
      setQrData('');
      setManufacturingPlant('E41 G2');
      setCodeManuallyEdited(false);
      setQrManuallyEdited(false);

      // Refresh list in background silently
      fetchModels(true);
    } catch (err) {
      console.error('Error submitting model:', err);
      showToast(err.message || 'Error creating model', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle active status
  const handleToggleActive = async (model) => {
    const nextStatus = !model.is_active;
    const actionName = nextStatus ? 'activate' : 'deactivate';

    if (
      !confirm(
        `Are you sure you want to ${actionName} model "${model.name} (${model.code})"?`
      )
    ) {
      return;
    }

    try {
      setActionLoadingId(model.id);
      const res = await fetch('/api/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: model.id,
          is_active: nextStatus,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || `Failed to ${actionName} model`);
      }

      showToast(
        `Model ${model.code} ${nextStatus ? 'activated' : 'deactivated'} successfully.`,
        'success'
      );

      // Optimistic update
      setModels((prev) =>
        prev.map((m) => (m.id === model.id ? { ...m, is_active: nextStatus } : m))
      );
    } catch (err) {
      console.error('Toggle status error:', err);
      showToast(err.message || 'Failed to update status', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Edit Model Modal
  const handleOpenEdit = (model) => {
    setEditingModel(model);
    setEditName(model.name || '');
    setEditCode(model.code || '');
    setEditDescription(model.description || '');
    setEditQrData(model.qr_data || '');
    setEditManufacturingPlant(model.manufacturing_plant || 'E41 G2');
  };

  // Submit Model Edit
  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editingModel) return;

    const trimmedName = editName.trim();
    const trimmedCode = editCode.trim().toUpperCase();

    if (!trimmedName) {
      showToast('Model name is required', 'warning');
      return;
    }
    if (!trimmedCode) {
      showToast('Model code is required', 'warning');
      return;
    }

    try {
      setSavingEdit(true);
      const res = await fetch('/api/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingModel.id,
          name: trimmedName,
          code: trimmedCode,
          description: editDescription.trim() || null,
          qr_data: editQrData.trim() || null,
          manufacturing_plant: editManufacturingPlant,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to update model');
      }

      showToast(`Model "${trimmedCode}" updated successfully`, 'success');
      setModels((prev) =>
        prev.map((m) =>
          m.id === editingModel.id
            ? {
                ...m,
                ...result.model,
                manufacturing_plant: editManufacturingPlant,
                current_stock: m.current_stock, // Preserve calculated stock
              }
            : m
        )
      );
      setEditingModel(null);
    } catch (err) {
      console.error('Save model edit error:', err);
      showToast(err.message || 'Error updating model', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Filtered models for search & plant filter
  const filteredModels = models.filter((m) => {
    if (plantFilter !== 'ALL' && (m.manufacturing_plant || 'E41 G2') !== plantFilter) {
      return false;
    }
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      m.name?.toLowerCase().includes(q) ||
      m.code?.toLowerCase().includes(q) ||
      m.qr_data?.toLowerCase().includes(q)
    );
  });

  // Table Columns
  const tableColumns = [
    {
      key: 'code',
      label: 'Model Code',
      render: (val, row) => (
        <div className="flex items-center space-x-2">
          <span className="font-mono font-bold text-sm text-primary-700 bg-primary-50 px-2.5 py-1 rounded-md border border-primary-200">
            {val}
          </span>
        </div>
      ),
    },
    {
      key: 'name',
      label: 'Model Name & Description',
      render: (val, row) => (
        <div>
          <div className="font-semibold text-gray-900">{val}</div>
          {row.description ? (
            <div className="text-xs text-gray-500 truncate max-w-xs">{row.description}</div>
          ) : (
            <div className="text-xs text-gray-400 italic">No description</div>
          )}
        </div>
      ),
    },
    {
      key: 'manufacturing_plant',
      label: 'Manufacturing Facility',
      render: (val, row) => {
        const p = val || row.manufacturing_plant || 'E41 G2';
        const isD4 = p === 'D4';
        const isC116 = p === 'C116';
        return (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
              isD4
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : isC116
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-indigo-50 text-indigo-800 border-indigo-200'
            }`}
          >
            <span>🏭</span>
            <span>{p} Plant</span>
          </span>
        );
      },
    },
    {
      key: 'qr_data',
      label: 'QR Code Data',
      render: (val) => (
        <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2.5 py-1 rounded border border-gray-200">
          {val}
        </span>
      ),
    },
    {
      key: 'current_stock',
      label: 'Current Stock',
      align: 'right',
      render: (val) => {
        const stock = Number(val ?? 0);
        let badgeColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
        if (stock === 0) {
          badgeColor = 'text-rose-700 bg-rose-50 border-rose-200';
        } else if (stock < 10) {
          badgeColor = 'text-amber-700 bg-amber-50 border-amber-200';
        }
        return (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${badgeColor}`}
          >
            {stock.toLocaleString()} units
          </span>
        );
      },
    },
    {
      key: 'is_active',
      label: 'Status',
      align: 'center',
      render: (val) =>
        val ? (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
            Inactive
          </span>
        ),
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (_, row) => (
        <div className="flex items-center justify-end space-x-2">
          {/* View QR Button */}
          <button
            type="button"
            onClick={() => setQrModalModel(row)}
            className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center space-x-1 shadow-none"
            title="View printable QR code label"
          >
            <svg className="w-3.5 h-3.5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
              />
            </svg>
            <span>View QR</span>
          </button>

          {/* Edit Model Button */}
          <button
            type="button"
            onClick={() => handleOpenEdit(row)}
            className="btn-secondary text-xs py-1.5 px-2.5 inline-flex items-center space-x-1 shadow-none text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 border-indigo-200"
            title="Edit model details"
          >
            <span>✏️ Edit</span>
          </button>

          {/* Toggle Active Button */}
          <button
            type="button"
            onClick={() => handleToggleActive(row)}
            disabled={actionLoadingId === row.id}
            className={`text-xs py-1.5 px-3 rounded-lg font-medium transition-colors border ${
              row.is_active
                ? 'border-gray-300 text-gray-700 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200'
                : 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
            }`}
          >
            {actionLoadingId === row.id
              ? 'Saving...'
              : row.is_active
              ? 'Deactivate'
              : 'Activate'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppShell allowedRoles={['admin']}>
      <div className="space-y-8">
        {/* Page Title & Overview */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
              Cooler Models Management
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Configure cooler models, generate barcode/QR labels, and review stock availability.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href="/jospo-20-models-labels.zip"
              download="jospo-20-models-labels.zip"
              className="btn-primary text-xs py-2 px-3.5 inline-flex items-center space-x-1.5 shadow-sm bg-black hover:bg-gray-800 text-white font-bold"
              title="Download complete BarTender package and labels for all 20 active models"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Download 20 Models Folder (.ZIP)</span>
            </a>
            <a
              href="/qr-codes/printable-labels-sheet.html"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs py-2 px-3 inline-flex items-center space-x-1.5 shadow-sm hover:border-primary-300"
              title="Open printable A4 sticker sheet in new tab"
            >
              <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Print A4 Label Sheet</span>
            </a>
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary-50 text-primary-700 border border-primary-200">
              Admin Protected
            </span>
          </div>
        </div>

        {/* SECTION 1: Add New Model Form Card */}
        <div className="card shadow-sm border border-gray-200">
          <div className="flex items-center space-x-3 pb-4 mb-5 border-b border-gray-100">
            <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-lg">
              +
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Add New Cooler Model</h2>
              <p className="text-xs text-gray-500">
                Register a new cooler model to enable production tracking and dispatch scanning.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateModel} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Model Name */}
              <div>
                <label className="label">
                  Model Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Jospo J-50 Desert Cooler"
                  value={name}
                  onChange={handleNameChange}
                  className="input-field"
                  required
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Official product display name
                </span>
              </div>

              {/* Model Code */}
              <div>
                <label className="label">
                  Model Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. J-50"
                  value={code}
                  onChange={handleCodeChange}
                  className="input-field font-mono font-medium uppercase"
                  required
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Short unique code identifier
                </span>
              </div>

              {/* Manufacturing Facility */}
              <div>
                <label className="label">
                  Manufacturing Facility <span className="text-red-500">*</span>
                </label>
                <select
                  value={manufacturingPlant}
                  onChange={(e) => setManufacturingPlant(e.target.value)}
                  className="input-field text-xs font-semibold bg-white"
                  required
                >
                  <option value="E41 G2">🏭 E41 G2 (Unit 1)</option>
                  <option value="C116">🏭 C116 (Unit 3)</option>
                  <option value="D4">🏭 D4 (Unit 2 & Central Hub)</option>
                </select>
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Plant that manufactures this model
                </span>
              </div>

              {/* QR Data (Auto-generated) */}
              <div>
                <label className="label">
                  QR Data <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. JOSPO-J50"
                  value={qrData}
                  onChange={handleQrChange}
                  className="input-field font-mono text-xs bg-gray-50"
                  required
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Scanned payload format: JOSPO-{'{CODE}'}
                </span>
              </div>

              {/* Description */}
              <div>
                <label className="label">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 50L Honeycomb Desert Cooler"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input-field"
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  Capacity, specs, or packaging notes
                </span>
              </div>
            </div>

            {/* Form Actions */}
            <div className="pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100">
              <div className="text-xs text-gray-500">
                Model codes and QR data must be unique across all system records.
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6"
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
                    <span>Saving Model...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>Save Cooler Model</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* SECTION 2: Models List */}
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Registered Cooler Models</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Total {models.length} model{models.length === 1 ? '' : 's'} defined in inventory
              </p>
            </div>

            {/* Plant Filter Pills & Search */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
                {[
                  { id: 'ALL', label: 'All Plants' },
                  { id: 'E41 G2', label: '🏭 E41 G2' },
                  { id: 'C116', label: '🏭 C116' },
                  { id: 'D4', label: '🏭 D4' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPlantFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      plantFilter === tab.id
                        ? 'bg-white text-gray-900 shadow-xs border border-gray-200'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field text-xs pl-8 pr-3 py-2 w-full sm:w-56"
                />
                <svg
                  className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              {/* Active Only Toggle */}
              <label className="inline-flex items-center space-x-2 text-xs text-gray-600 bg-white border border-gray-200 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={filterActiveOnly}
                  onChange={(e) => setFilterActiveOnly(e.target.checked)}
                  className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4"
                />
                <span>Active Only</span>
              </label>

              {/* Refresh Button */}
              <button
                type="button"
                onClick={fetchModels}
                disabled={loading}
                className="btn-secondary text-xs py-2 px-3 inline-flex items-center space-x-1"
                title="Refresh models list"
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
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Table or Loading */}
          {loading ? (
            <div className="card py-16 flex justify-center">
              <LoadingSpinner message="Fetching cooler models & stock..." size="lg" />
            </div>
          ) : (
            <DataTable
              columns={tableColumns}
              data={filteredModels}
              emptyMessage={
                searchQuery
                  ? `No models match your search "${searchQuery}"`
                  : 'No cooler models registered yet. Use the form above to add your first model.'
              }
            />
          )}
        </div>

        {/* Modal: View & Print QR Code */}
        {qrModalModel && (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setQrModalModel(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 relative animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={() => setQrModalModel(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-1.5 transition-colors"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="text-center mb-6">
                <span className="inline-block px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-primary-700 bg-primary-50 rounded-full mb-2">
                  Label Preview
                </span>
                <h3 className="text-xl font-extrabold text-gray-900">
                  Cooler QR Code Label
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Ready to print or download for affixing to production packaging.
                </p>
              </div>

              {/* QR Label Component */}
              <QRGenerator
                value={qrModalModel.qr_data}
                modelName={qrModalModel.name}
                modelCode={qrModalModel.code}
                size={180}
              />
            </div>
          </div>
        )}

        {/* Modal: Edit Cooler Model */}
        {editingModel && (
          <div
            className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-model-title"
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full p-6 sm:p-7 relative animate-scaleUp space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">✏️</span>
                  <div>
                    <h3 id="edit-model-title" className="text-lg font-bold text-gray-900">
                      Edit Cooler Model
                    </h3>
                    <p className="text-xs text-gray-500">
                      Updating master catalog specifications for {editingModel.code}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingModel(null)}
                  disabled={savingEdit}
                  className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-1.5 transition-colors"
                  aria-label="Close modal"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSaveEdit} className="space-y-4">
                {/* Model Name */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Model Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="e.g. Jospo Icecool 65 NCG WG"
                    className="input-field text-sm font-semibold bg-white"
                    required
                  />
                </div>

                {/* Model Code & QR Data */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      Model Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                      placeholder="e.g. ICECOOL-65"
                      className="input-field text-sm font-mono font-bold bg-white uppercase"
                      required
                    />
                    <span className="text-[10px] text-gray-400 mt-0.5 block">Unique system identifier</span>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-700 block mb-1">
                      QR Code Payload
                    </label>
                    <input
                      type="text"
                      value={editQrData}
                      onChange={(e) => setEditQrData(e.target.value)}
                      placeholder="e.g. JOSPO-ICECOOL-65"
                      className="input-field text-sm font-mono font-semibold bg-white"
                    />
                    <span className="text-[10px] text-gray-400 mt-0.5 block">Encoded in carton QR labels</span>
                  </div>
                </div>

                {/* Manufacturing Facility */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Manufacturing Facility <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={editManufacturingPlant}
                    onChange={(e) => setEditManufacturingPlant(e.target.value)}
                    className="input-field text-xs font-semibold bg-white"
                    required
                  >
                    <option value="E41 G2">🏭 E41 G2 (Unit 1)</option>
                    <option value="C116">🏭 C116 (Unit 3)</option>
                    <option value="D4">🏭 D4 (Unit 2 & Central Hub)</option>
                  </select>
                  <span className="text-[10px] text-gray-400 mt-0.5 block">
                    Designated plant allowed to assemble and log production for this model
                  </span>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Specifications / Description
                  </label>
                  <textarea
                    rows={3}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="e.g. 65L tank capacity, honeycomb cooling pads, high-speed motor"
                    className="input-field text-xs bg-white"
                  />
                </div>

                {/* Stock Notice */}
                <div className="bg-amber-50 rounded-xl p-3 border border-amber-200 text-xs text-amber-800 flex items-start space-x-2">
                  <span className="text-base flex-shrink-0">ℹ️</span>
                  <span>
                    Current stock balance of <strong>{editingModel.current_stock || 0} units</strong> and historical transactions will remain preserved.
                  </span>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setEditingModel(null)}
                    disabled={savingEdit}
                    className="btn-secondary text-xs py-2 px-4"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="btn-primary text-xs py-2 px-5 inline-flex items-center space-x-1.5 shadow-md"
                  >
                    {savingEdit ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <span>💾 Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
