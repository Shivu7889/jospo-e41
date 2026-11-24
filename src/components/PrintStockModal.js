'use client';

import React, { useState, useMemo } from 'react';
import { ALL_PLANTS_ID } from '@/lib/plants';

export default function PrintStockModal({
  stockList = [],
  initialSearch = '',
  activePlant = ALL_PLANTS_ID,
  stats = {},
  plantTotals = {},
  userName = 'Staff',
  onClose,
}) {
  const [searchQuery, setSearchQuery] = useState(initialSearch || '');
  const [printSort, setPrintSort] = useState('stock_desc'); // 'stock_desc' | 'stock_asc' | 'code_asc'
  const [pdfNotice, setPdfNotice] = useState(false);

  // Strictly filter for models that have available stock (> 0)
  const printableList = useMemo(() => {
    // 1. Only include items with current_stock > 0
    let list = stockList.filter((it) => (Number(it.current_stock) || 0) > 0);

    // 2. Search query filter (if provided)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (it) =>
          it.model_code?.toLowerCase().includes(q) ||
          it.model_name?.toLowerCase().includes(q)
      );
    }

    // 3. Sort models
    list.sort((a, b) => {
      const stockA = Number(a.current_stock) || 0;
      const stockB = Number(b.current_stock) || 0;

      if (printSort === 'stock_desc') {
        if (stockB !== stockA) return stockB - stockA;
        return (a.model_code || '').localeCompare(b.model_code || '');
      }
      if (printSort === 'stock_asc') {
        if (stockA !== stockB) return stockA - stockB;
        return (a.model_code || '').localeCompare(b.model_code || '');
      }
      if (printSort === 'code_asc') {
        return (a.model_code || '').localeCompare(b.model_code || '');
      }
      return 0;
    });

    return list;
  }, [stockList, searchQuery, printSort]);

  const totalCalculatedUnits = useMemo(() => {
    return printableList.reduce((sum, item) => sum + (Number(item.current_stock) || 0), 0);
  }, [printableList]);

  const printDateStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(new Date());
  }, []);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  const handleSaveAsPdf = () => {
    if (typeof window !== 'undefined') {
      setPdfNotice(true);
      const origTitle = document.title;
      const cleanPlant = activePlant === ALL_PLANTS_ID ? 'All_Plants' : activePlant.replace(/\s+/g, '_');
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).replace(/\s+/g, '_');

      // Set clean document title so browser's "Save as PDF" uses this filename
      document.title = `Jospo_Stock_Report_${cleanPlant}_${dateStr}`;

      window.print();

      setTimeout(() => {
        document.title = origTitle;
      }, 1500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white print:static"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-4xl w-full p-4 sm:p-6 relative print:border-none print:shadow-none print:p-0 print:max-w-none">
        {/* Screen-Only Control Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 mb-4 border-b border-gray-200 print:hidden">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🖨️</span>
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center space-x-2">
                <span>Print Stock Sheet</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                  ✓ Available Stock Only (&gt;0)
                </span>
              </h3>
              <p className="text-xs text-gray-500">
                Official physical audit report containing only models with positive available stock
              </p>
            </div>
          </div>

          {/* Quick Sort & Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search model code/name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input-field text-xs pl-7 pr-3 py-1.5 w-44 bg-gray-50 border-gray-300"
              />
              <svg
                className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <select
              value={printSort}
              onChange={(e) => setPrintSort(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold bg-white text-gray-700 cursor-pointer"
            >
              <option value="stock_desc">📈 Stock: High to Low</option>
              <option value="stock_asc">📉 Stock: Low to High</option>
              <option value="code_asc">🔤 Model Code (A-Z)</option>
            </select>

            <button
              type="button"
              onClick={handlePrint}
              disabled={!printableList.length}
              className="btn-primary text-xs py-1.5 px-3.5 inline-flex items-center space-x-1.5 font-bold shadow-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              title="Print document on physical printer"
            >
              <span>🖨️ Print Now</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAsPdf}
              disabled={!printableList.length}
              className="text-xs py-1.5 px-3.5 inline-flex items-center space-x-1.5 font-bold shadow-xs bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors border border-rose-700 disabled:opacity-50 active:scale-95"
              title="Save document as PDF file"
            >
              <span>📄 Save as PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* PDF Guidance Banner */}
        {pdfNotice && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 flex items-center justify-between text-xs text-rose-950 shadow-xs print:hidden animate-in fade-in duration-150">
            <div className="flex items-center space-x-2.5">
              <span className="text-xl">📄</span>
              <div>
                <p className="font-bold text-rose-950">How to Save as PDF:</p>
                <p className="text-[11px] text-rose-800 mt-0.5">
                  In your browser&apos;s print window, select <strong>Destination &rarr; &quot;Save as PDF&quot;</strong>, then click <strong>Save</strong>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPdfNotice(false)}
              className="text-rose-600 hover:text-rose-900 font-bold text-xs p-1 rounded-md"
            >
              ✕
            </button>
          </div>
        )}

        {/* Printable Document Sheet */}
        <div className="border border-gray-900 p-5 sm:p-7 rounded-lg text-gray-900 text-xs font-sans print:border-2 print:border-black print:p-4 print:rounded-none bg-white">
          {/* Header */}
          <div className="text-center border-b-2 border-gray-900 pb-3 mb-4">
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-black">
              JOSPO APPLIANCES PRIVATE LIMITED
            </h1>
            <p className="text-[11px] text-gray-700 font-medium tracking-wide mt-0.5">
              Manufacturing Facilities: E41 G2 • D4 Plant • C116 Plant • Active On-Hand Inventory
            </p>
            <div className="mt-2 inline-block px-4 py-1 bg-black text-white font-extrabold text-xs uppercase tracking-widest rounded print:bg-black print:text-white">
              AVAILABLE PHYSICAL STOCK REPORT
            </div>
          </div>

          {/* Meta Details Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2.5 px-3 bg-gray-50 border border-gray-300 rounded-lg mb-4 text-xs">
            <div>
              <span className="text-[10px] text-gray-500 uppercase font-bold block">Facility / Plant</span>
              <span className="font-extrabold text-gray-900 text-xs">
                {activePlant === ALL_PLANTS_ID ? 'Consolidated (All 3 Plants)' : `${activePlant} Plant`}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase font-bold block">Report Generated</span>
              <span className="font-semibold text-gray-800 text-[11px] block">{printDateStr}</span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase font-bold block">In-Stock Models</span>
              <span className="font-extrabold text-gray-900 text-xs">
                {printableList.length} Model{printableList.length === 1 ? '' : 's'} with Stock
              </span>
            </div>
            <div>
              <span className="text-[10px] text-gray-500 uppercase font-bold block">Total Physical Stock</span>
              <span className="font-black text-sm text-emerald-800 font-mono">
                {totalCalculatedUnits.toLocaleString()} units
              </span>
            </div>
          </div>

          {/* 3-Plant Breakdown Strip (if Consolidated View) */}
          {activePlant === ALL_PLANTS_ID && plantTotals && (
            <div className="grid grid-cols-3 gap-2 mb-4 text-center text-xs">
              <div className="border border-gray-300 p-2 rounded bg-gray-50">
                <span className="text-[10px] text-gray-500 font-bold block">🏭 E41 G2 Plant</span>
                <span className="font-mono font-black text-gray-900 text-sm">
                  {(plantTotals['E41 G2'] || 0).toLocaleString()} pcs
                </span>
              </div>
              <div className="border border-gray-300 p-2 rounded bg-gray-50">
                <span className="text-[10px] text-gray-500 font-bold block">🏭 D4 Plant</span>
                <span className="font-mono font-black text-gray-900 text-sm">
                  {(plantTotals['D4'] || 0).toLocaleString()} pcs
                </span>
              </div>
              <div className="border border-gray-300 p-2 rounded bg-gray-50">
                <span className="text-[10px] text-gray-500 font-bold block">🏭 C116 Plant</span>
                <span className="font-mono font-black text-gray-900 text-sm">
                  {(plantTotals['C116'] || 0).toLocaleString()} pcs
                </span>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto mb-6">
            <table className="min-w-full border-collapse border border-gray-400 text-xs">
              <thead className="bg-gray-100 font-bold text-gray-900 border-b border-gray-400">
                <tr>
                  <th className="border border-gray-300 px-2.5 py-1.5 text-center w-10">S.N.</th>
                  <th className="border border-gray-300 px-3 py-1.5 text-left">Model Code</th>
                  <th className="border border-gray-300 px-3 py-1.5 text-left">Cooler Model Description</th>
                  <th className="border border-gray-300 px-2.5 py-1.5 text-center">Mfg Plant</th>
                  {activePlant === ALL_PLANTS_ID && (
                    <>
                      <th className="border border-gray-300 px-2 py-1.5 text-right font-mono">E41 G2</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-right font-mono">D4</th>
                      <th className="border border-gray-300 px-2 py-1.5 text-right font-mono">C116</th>
                    </>
                  )}
                  <th className="border border-gray-300 px-3 py-1.5 text-right font-bold bg-amber-50/50">
                    Available Stock
                  </th>
                  <th className="border border-gray-300 px-2.5 py-1.5 text-center">Status</th>
                  <th className="border border-gray-300 px-3 py-1.5 text-center w-28 print:table-cell hidden">
                    Physical Verify
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-300 text-gray-900">
                {printableList.length === 0 ? (
                  <tr>
                    <td
                      colSpan={activePlant === ALL_PLANTS_ID ? 9 : 6}
                      className="text-center py-8 text-gray-500 italic bg-gray-50"
                    >
                      No models currently have available stock (&gt;0 units) for this facility.
                    </td>
                  </tr>
                ) : (
                  printableList.map((item, idx) => {
                    const stock = Number(item.current_stock ?? 0);
                    const isLow = stock < 10;

                    return (
                      <tr key={item.id || idx} className={idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}>
                        <td className="border border-gray-300 px-2.5 py-1.5 text-center text-gray-500 font-mono">
                          {idx + 1}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 font-mono font-bold text-gray-900">
                          {item.model_code}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 font-medium text-gray-800">
                          {item.model_name}
                        </td>
                        <td className="border border-gray-300 px-2.5 py-1.5 text-center text-[11px] text-gray-600">
                          {item.manufacturing_plant || 'E41 G2'}
                        </td>
                        {activePlant === ALL_PLANTS_ID && (
                          <>
                            <td className="border border-gray-300 px-2 py-1.5 text-right font-mono text-gray-700">
                              {(item.plant_breakdown?.['E41 G2'] ?? 0).toLocaleString()}
                            </td>
                            <td className="border border-gray-300 px-2 py-1.5 text-right font-mono text-gray-700">
                              {(item.plant_breakdown?.['D4'] ?? 0).toLocaleString()}
                            </td>
                            <td className="border border-gray-300 px-2 py-1.5 text-right font-mono text-gray-700">
                              {(item.plant_breakdown?.['C116'] ?? 0).toLocaleString()}
                            </td>
                          </>
                        )}
                        <td className="border border-gray-300 px-3 py-1.5 text-right font-mono font-black text-sm bg-amber-50/30 text-gray-900">
                          {stock.toLocaleString()}
                        </td>
                        <td className={`border border-gray-300 px-2.5 py-1.5 text-center text-[11px] font-bold ${
                          isLow ? 'text-amber-800' : 'text-emerald-800'
                        }`}>
                          {isLow ? '▲ Low Stock' : '✓ In Stock'}
                        </td>
                        <td className="border border-gray-300 px-3 py-1.5 text-center print:table-cell hidden">
                          <div className="border-b border-dotted border-gray-400 h-4"></div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-gray-100 font-black border-t-2 border-gray-400">
                <tr>
                  <td
                    colSpan={activePlant === ALL_PLANTS_ID ? 7 : 4}
                    className="border border-gray-300 px-3 py-2 text-right uppercase text-xs tracking-wider"
                  >
                    Grand Total Available Stock:
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-right font-mono text-sm text-black font-black bg-amber-100/50">
                    {totalCalculatedUnits.toLocaleString()} units
                  </td>
                  <td className="border border-gray-300 px-2.5 py-2 text-center text-[11px] text-emerald-800 font-bold">
                    {printableList.length} Models
                  </td>
                  <td className="border border-gray-300 px-3 py-2 print:table-cell hidden"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Signatures & Certification Block */}
          <div className="grid grid-cols-3 gap-6 pt-6 border-t-2 border-gray-900 text-center">
            <div>
              <div className="border-b border-gray-700 h-10 mb-1"></div>
              <p className="font-bold text-[11px] text-gray-900">Physical Stock Counted By</p>
              <p className="text-[10px] text-gray-500">Storekeeper / Warehouse Staff</p>
            </div>
            <div>
              <div className="border-b border-gray-700 h-10 mb-1"></div>
              <p className="font-bold text-[11px] text-gray-900">Audited &amp; Reconciled By</p>
              <p className="text-[10px] text-gray-500">Inventory Supervisor</p>
            </div>
            <div>
              <div className="border-b border-gray-700 h-10 mb-1"></div>
              <p className="font-bold text-[11px] text-gray-900">Approved &amp; Certified</p>
              <p className="text-[10px] text-gray-500">Plant Head / Authorized Signatory</p>
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-5 pt-2 border-t border-gray-200 text-center text-[10px] text-gray-400 flex justify-between items-center">
            <span>Jospo E41 Manufacturing &amp; Inventory Management System</span>
            <span>Generated By: {userName}</span>
            <span>Official Available Stock Audit</span>
          </div>
        </div>

        {/* Modal Bottom Actions (Screen Only) */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-gray-100 print:hidden">
          <span className="text-xs text-gray-500">
            💡 Tip: To download, click <strong>Save as PDF</strong> and select Destination &rarr; <em>&quot;Save as PDF&quot;</em> in your print dialog.
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs py-2 px-4"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!printableList.length}
              className="btn-primary text-xs py-2 px-4 inline-flex items-center space-x-1.5 font-bold shadow-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              <span>🖨️ Print Now</span>
            </button>
            <button
              type="button"
              onClick={handleSaveAsPdf}
              disabled={!printableList.length}
              className="text-xs py-2 px-4 inline-flex items-center space-x-1.5 font-bold shadow-md bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition-colors border border-rose-700 disabled:opacity-50 active:scale-95"
            >
              <span>📄 Save as PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
