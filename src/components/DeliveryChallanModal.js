'use client';

import {
  getDispatchTypeMeta,
  cleanDispatchRemarks,
  isCoLoadingDispatch,
  resolveNextLoadingPlant,
  resolveSecondPlant,
  resolveItemLoadedPlant,
  formatCoLoadingRoute,
} from '@/lib/dispatch';
import { getPlantMeta } from '@/lib/plants';

/**
 * DeliveryChallanModal
 * Official printable Delivery Challan & Gate Pass for dispatched coolers.
 * Supports single-plant dispatches and multi-plant consolidated party dispatches.
 * Optimized for both desktop preview and A4 black-and-white printing.
 */
export default function DeliveryChallanModal({ dispatch, onClose }) {
  if (!dispatch) return null;

  const typeMeta = getDispatchTypeMeta(dispatch);
  const isCoLoad = isCoLoadingDispatch(dispatch);

  const totalQuantity = (dispatch.dispatch_items || []).reduce(
    (acc, it) => acc + (Number(it.quantity) || 0),
    0
  );

  const byPlantSummary = {};
  (dispatch.dispatch_items || []).forEach((item) => {
    const p = resolveItemLoadedPlant(item, dispatch);
    byPlantSummary[p] = (byPlantSummary[p] || 0) + (Number(item.quantity) || 0);
  });

  const plantName = dispatch.from_location || 'E41 G2';
  const challanNo = `MSA-DC-${(dispatch.id || '').slice(0, 8).toUpperCase()}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:p-0 print:bg-white print:static"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-2xl w-full p-6 sm:p-8 relative print:border-none print:shadow-none print:p-0 print:max-w-none">
        {/* Screen-only Action Toolbar */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-gray-100 print:hidden">
          <div className="flex items-center space-x-2">
            <span className="text-xl">🖨️</span>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {typeMeta.type === 'local'
                  ? 'Inter-Plant Transfer Gate Pass'
                  : isCoLoad
                  ? 'Consolidated Multi-Plant Delivery Challan'
                  : 'Delivery Challan & Gate Pass'}
              </h3>
              <p className="text-xs text-gray-500">
                {typeMeta.type === 'local'
                  ? 'Official stock transfer documentation to our other plant division'
                  : isCoLoad
                  ? 'Official consolidated challan showing loading breakdown from multiple plants'
                  : 'Official dispatch documentation for driver & gate security'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="btn-primary text-xs py-2 px-4 inline-flex items-center space-x-1.5 shadow-md"
            >
              <span>🖨️ Print Challan</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-1.5 transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Printable Document Sheet (A4 Proportion) */}
        <div className="border-2 border-gray-900 p-6 rounded-lg text-gray-900 text-xs font-sans print:border-2 print:border-black print:p-6 print:rounded-none">
          {/* Header */}
          <div className="text-center border-b-2 border-gray-900 pb-3 mb-4">
            <h1 className="text-2xl font-black uppercase tracking-wider text-gray-950">
              MS APPLIANCES
            </h1>
            <p className="text-xs text-gray-800 font-semibold mt-1">
              Plot no - {plantName}, salarpur kharithal tijara rajasthan 301018
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-gray-800 font-medium mt-1">
              <span>
                <strong>Mobile number:</strong> 9755314500, 9784646313
              </span>
              <span>•</span>
              <span>
                <strong>GSTIN:</strong> <span className="font-mono font-bold tracking-wider">08AJRPG3529Q1ZG</span>
              </span>
            </div>
            <div className="mt-2.5 inline-block px-4 py-1 bg-gray-900 text-white font-bold text-xs uppercase tracking-wider rounded print:bg-black print:text-white">
              {typeMeta.type === 'local'
                ? 'INTER-PLANT STOCK TRANSFER CHALLAN / VEHICLE GATE PASS'
                : isCoLoad
                ? 'CONSOLIDATED MULTI-PLANT DELIVERY CHALLAN / VEHICLE GATE PASS'
                : 'DELIVERY CHALLAN / VEHICLE GATE PASS'}
            </div>
          </div>

          {/* Meta Details Grid */}
          <div className="grid grid-cols-2 gap-4 pb-3 mb-3 border-b border-gray-300">
            <div>
              <p className="text-[11px] text-gray-600">Challan / Pass No:</p>
              <p className="font-mono font-bold text-sm text-gray-900">{challanNo}</p>
              <p className="text-[11px] text-gray-600 mt-1.5">Dispatch Category:</p>
              <p className="font-bold text-gray-900 inline-flex items-center space-x-1">
                <span>{typeMeta.icon}</span>
                <span>{typeMeta.label}</span>
                {isCoLoad && (
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-extrabold">
                    MULTI-PLANT LOAD
                  </span>
                )}
              </p>
              <p className="text-[11px] text-gray-600 mt-1.5">Dispatch Date:</p>
              <p className="font-bold text-gray-900">{dispatch.dispatch_date || 'N/A'}</p>
              <p className="text-[11px] text-gray-600 mt-1.5">Origin Factory:</p>
              <p className="font-semibold text-gray-900">{plantName} (MS Appliances)</p>
            </div>
            <div>
              <p className="text-[11px] text-gray-600">Vehicle / Truck No:</p>
              <p className="font-mono font-bold text-sm text-primary-800 print:text-black">
                {dispatch.vehicle_number || 'N/A'}
              </p>
              <p className="text-[11px] text-gray-600 mt-1.5">
                {typeMeta.type === 'local' ? 'Destination Plant / Receiving Unit:' : 'Destination / Consignee:'}
              </p>
              <p className="font-bold text-gray-900">{dispatch.destination || 'N/A'}</p>
              {isCoLoad && (
                <>
                  <p className="text-[11px] text-gray-600 mt-1.5">Loading Stop Points:</p>
                  <p className="font-bold text-gray-900 leading-snug">
                    {formatCoLoadingRoute(dispatch)}
                  </p>
                </>
              )}
              <p className="text-[11px] text-gray-600 mt-1.5">Authorized Dispatcher:</p>
              <p className="font-semibold text-gray-900">{dispatch.employees?.name || 'Authorized Staff'}</p>
            </div>
          </div>

          {/* Table of Dispatched Coolers */}
          <div className="mb-4">
            <table className="w-full text-left border-collapse border border-gray-400">
              <thead>
                <tr className="bg-gray-100 print:bg-gray-200">
                  <th className="border border-gray-400 px-2 py-1.5 text-[11px] font-bold text-center w-10">
                    S.No
                  </th>
                  <th className="border border-gray-400 px-2 py-1.5 text-[11px] font-bold">
                    Model Code
                  </th>
                  <th className="border border-gray-400 px-2 py-1.5 text-[11px] font-bold">
                    Cooler Model Description
                  </th>
                  <th className="border border-gray-400 px-2 py-1.5 text-[11px] font-bold text-center">
                    Loaded At
                  </th>
                  <th className="border border-gray-400 px-2 py-1.5 text-[11px] font-bold text-right w-24">
                    Qty (Units)
                  </th>
                </tr>
              </thead>
              <tbody>
                {(dispatch.dispatch_items || []).map((item, index) => {
                  const loadedPlant = resolveItemLoadedPlant(item, dispatch);
                  return (
                    <tr key={item.id || index}>
                      <td className="border border-gray-400 px-2 py-1.5 text-center font-mono text-[11px]">
                        {index + 1}
                      </td>
                      <td className="border border-gray-400 px-2 py-1.5 font-mono font-bold text-[11px]">
                        {item.cooler_models?.code || 'N/A'}
                      </td>
                      <td className="border border-gray-400 px-2 py-1.5 text-[11px]">
                        {item.cooler_models?.name || 'Air Cooler Unit'}
                      </td>
                      <td className="border border-gray-400 px-2 py-1.5 text-center text-[11px] font-semibold">
                        {loadedPlant}
                      </td>
                      <td className="border border-gray-400 px-2 py-1.5 text-right font-bold text-[11px]">
                        {Number(item.quantity || 0).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {/* Total Row */}
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-900 print:bg-gray-100">
                  <td colSpan={4} className="border border-gray-400 px-3 py-2 text-right uppercase text-[11px]">
                    Total Manufactured Units Dispatched:
                  </td>
                  <td className="border border-gray-400 px-2 py-2 text-right font-extrabold text-sm font-mono">
                    {totalQuantity.toLocaleString()} pcs
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Plant Loading Breakdown Summary for Co-Loading */}
          {isCoLoad && Object.keys(byPlantSummary).length > 1 && (
            <div className="mb-4 p-2 bg-gray-50 border border-gray-300 rounded text-[11px] flex flex-wrap items-center justify-between font-mono print:bg-white print:border-gray-400">
              <span className="font-bold uppercase text-[10px]">Plant Loading Breakdown:</span>
              <div className="space-x-3">
                {Object.entries(byPlantSummary).map(([plant, qty]) => (
                  <span key={plant} className="font-bold">
                    🏭 {plant}: {qty} pcs
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Remarks */}
          {cleanDispatchRemarks(dispatch.remarks) && (
            <div className="mb-4 p-2 bg-gray-50 border border-gray-200 rounded text-[11px] print:bg-white print:border-gray-300">
              <span className="font-bold">Dispatch Notes / Remarks:</span> {cleanDispatchRemarks(dispatch.remarks)}
            </div>
          )}

          {/* Official Undertaking */}
          <div className="text-[10px] text-gray-500 border-t border-gray-200 pt-2 mb-6">
            Certified that the above mentioned items have been thoroughly inspected, tested, and dispatched in sound condition in sealed export cartons from MS Appliances. Driver must verify total count before leaving factory premises.
          </div>

          {/* Signature Blocks */}
          {isCoLoad ? (
            <div className="pt-6 border-t-2 border-dashed border-gray-400">
              <div className="flex flex-wrap items-end justify-between gap-3 text-center text-[10px]">
                {Object.keys(byPlantSummary).map((plantName, pIdx) => (
                  <div key={plantName} className="flex-1 min-w-[90px]">
                    <div className="h-10"></div>
                    <div className="border-t border-gray-700 pt-1 font-semibold">
                      Stop {pIdx + 1} ({plantName})
                    </div>
                  </div>
                ))}
                <div className="flex-1 min-w-[90px]">
                  <div className="h-10"></div>
                  <div className="border-t border-gray-700 pt-1 font-semibold">Driver / Carrier</div>
                </div>
                <div className="flex-1 min-w-[90px]">
                  <div className="h-10"></div>
                  <div className="border-t border-gray-700 pt-1 font-semibold">
                    For MS APPLIANCES<br />
                    <span className="text-[9px] text-gray-500 font-normal">(Authorized Signatory)</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 pt-6 border-t-2 border-dashed border-gray-400 text-center">
              <div>
                <div className="h-10"></div>
                <div className="border-t border-gray-700 pt-1 font-semibold">Prepared By (Stores)</div>
              </div>
              <div>
                <div className="h-10"></div>
                <div className="border-t border-gray-700 pt-1 font-semibold">
                  For MS APPLIANCES<br />
                  <span className="text-[9px] text-gray-500 font-normal">(Authorized Signatory)</span>
                </div>
              </div>
              <div>
                <div className="h-10"></div>
                <div className="border-t border-gray-700 pt-1 font-semibold">Driver / Carrier Signature</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
