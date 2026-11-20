'use client';

import React, { useState, useMemo } from 'react';
import { ALL_PLANTS_ID } from '@/lib/plants';

export default function PrintStockModal({
  stockList = [],
  activePlant = ALL_PLANTS_ID,
  stats = {},
  plantTotals = {},
  userName = 'Staff',
  onClose,
}) {
  const [printFilter, setPrintFilter] = useState('all'); // 'all' | 'in_stock' | 'out_of_stock'
  const [printSort, setPrintSort] = useState('stock_desc'); // 'stock_desc' | 'stock_asc' | 'code_asc'

  // Filter & sort for print document
  const printableList = useMemo(() => {
    let list = [...stockList];

    if (printFilter === 'in_stock') {
      list = list.filter((it) => (Number(it.current_stock) || 0) > 0);
    } else if (printFilter === 'out_of_stock') {
      list = list.filter((it) => (Number(it.current_stock) || 0) === 0);
    }

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
  }, [stockList, printFilter, printSort]);

  const totalCalculatedUnits = useMemo(() => {
    return printableList.reduce((sum, item) => sum + (Number(item.current_stock) || 0), 0);
  }, [printableList]);

  const inStockCount = useMemo(() => {
    return stockList.filter((it) => (Number(it.current_stock) || 0) > 0).length;
  }, [stockList]);

  const outOfStockCount = useMemo(() => {
    return stockList.filter((it) => (Number(it.current_stock) || 0) === 0).length;
  }, [stockList]);

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
              <h3 className="text-base font-bold text-gray-900">
                Print Stock Inventory Sheet
              </h3>
              <p className="text-xs text-gray-500">
                Official physical audit sheet sorted by stock availability
              </p>
            </div>
          </div>

          {/* Quick Filter & Sort Controls for Print */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-gray-300 p-0.5 bg-gray-50 text-xs">
              <button
                type="button"
                onClick={() => setPrintFilter('all')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  printFilter === 'all'
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                All ({stockList.length})
              </button>
              <button
                type="button"
                onClick={() => setPrintFilter('in_stock')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  printFilter === 'in_stock'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                In Stock ({inStockCount})
              </button>
              <button
                type="button"
                onClick={() => setPrintFilter('out_of_stock')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  printFilter === 'out_of_stock'
                    ? 'bg-white text-rose-800 shadow-xs'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Zero Stock ({outOfStockCount})
              </button>
            </div>

            <select
              value={printSort}
              onChange={(e) => setPrintSort(e.target.value)}
              className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold bg-white text-gray-700"
            >
              <option value="stock_desc">📈 Stock: High to Low</option>
              <option value="stock_asc">📉 Stock: Low to High</option>
              <option value="code_asc">🔤 Model Code (A-Z)</option>
            </select>

            <button
              type="button"
              onClick={handlePrint}
              className="btn-primary text-xs py-1.5 px-4 inline-flex items-center space-x-1.5 font-bold shadow-sm"
            >
              <span>🖨️ Print Now</span>
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

        {/* Printable Document Sheet */}
        <div className="border border-gray-900 p-5 sm:p-7 rounded-lg text-gray-900 text-xs font-sans print:border-2 print:border-black print:p-4 print:rounded-none bg-white">
          {/* Header */}
          <div className="text-center border-b-2 border-gray-900 pb-3 mb-4">
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-black">
              JOSPO APPLIANCES PRIVATE LIMITED
            </h1>
            <p className="text-[11px] text-gray-700 font-medium tracking-wide mt-0.5">
              Manufacturing Facilities: E41 G2 • D4 Plant • C116 Plant • Enterprise Inventory Control
            </p>
            <div className="mt-2 inline-block px-4 py-1 bg-black text-white font-extrabold text-xs uppercase tracking-widest rounded print:bg-black print:text-white">
              PHYSICAL STOCK INVENTORY &amp; AUDIT REPORT
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
              <span className="text-[10px] text-gray-500 uppercase font-bold block">Total Models</span>
              <span className="font-extrabold text-gray-900 text-xs">
                {printableList.length} Model{printableList.length === 1 ? '' : 's'} Listed
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
                  <th className="border border-gray-300 px-3 py-1.5 text-right font-bold">
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
                      className="text-center py-6 text-gray-500 italic"
                    >
                      No models matching selected print criteria.
                    </td>
                  </tr>
                ) : (
                  printableList.map((item, idx) => {
                    const stock = Number(item.current_stock ?? 0);
                    let statusLabel = 'Available';
                    let statusClass = 'text-emerald-800 font-bold';
                    if (stock === 0) {
                      statusLabel = 'Out of Stock';
                      statusClass = 'text-rose-700 font-bold';
                    } else if (stock < 10) {
                      statusLabel = 'Low Stock';
                      statusClass = 'text-amber-800 font-bold';
                    }

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
                        <td className="border border-gray-300 px-3 py-1.5 text-right font-mono font-black text-sm">
                          {stock.toLocaleString()}
                        </td>
                        <td className={`border border-gray-300 px-2.5 py-1.5 text-center text-[11px] ${statusClass}`}>
                          {statusLabel}
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
                  <td className="border border-gray-300 px-3 py-2 text-right font-mono text-sm text-black font-black">
                    {totalCalculatedUnits.toLocaleString()} units
                  </td>
                  <td className="border border-gray-300 px-2.5 py-2 text-center text-[11px]">
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
            <span>Official Audit Record</span>
          </div>
        </div>

        {/* Modal Bottom Actions (Screen Only) */}
        <div className="mt-4 flex items-center justify-between print:hidden">
          <span className="text-xs text-gray-500">
            Tip: Press <strong>Ctrl+P</strong> or <strong>Cmd+P</strong> or click <strong>Print Now</strong>. The document is formatted for standard A4 paper.
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
              className="btn-primary text-xs py-2 px-5 inline-flex items-center space-x-1.5 font-bold shadow-md"
            >
              <span>🖨️ Print Now</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
