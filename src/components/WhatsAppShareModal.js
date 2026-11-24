'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { ALL_PLANTS_ID } from '@/lib/plants';

export default function WhatsAppShareModal({
  isOpen = false,
  onClose,
  stockList = [],
  filteredStockList = [],
  stats = {},
  plantTotals = {},
  activePlant = ALL_PLANTS_ID,
  userName = 'Staff',
  singleModel = null,
}) {
  // Saved phone number from localStorage
  const [phoneNumber, setPhoneNumber] = useState('');
  const [rememberPhone, setRememberPhone] = useState(true);
  const [reportMode, setReportMode] = useState('in_stock'); // 'in_stock' | 'summary' | 'all' | 'filtered'
  const [customNote, setCustomNote] = useState('');
  const [copied, setCopied] = useState(false);

  // Load saved phone number on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedPhone = localStorage.getItem('jospo_owner_whatsapp_phone');
        if (savedPhone) setPhoneNumber(savedPhone);
      } catch (e) {}
    }
  }, []);

  // Format Indian phone number for WhatsApp wa.me link
  const sanitizePhoneNumber = (raw) => {
    if (!raw) return '';
    let digits = raw.replace(/\D/g, '');
    // If standard 10-digit Indian mobile number without country code
    if (digits.length === 10) {
      digits = '91' + digits;
    }
    return digits;
  };

  // Generate Date & Time string
  const timestampStr = useMemo(() => {
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timeFormatted = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return `${dateFormatted}, ${timeFormatted}`;
  }, []);

  // Generate WhatsApp formatted text message
  const generatedMessage = useMemo(() => {
    const divider = '━━━━━━━━━━━━━━━━━━━━';

    // CASE 1: Single Model Quick Share
    if (singleModel) {
      const code = singleModel.model_code || 'N/A';
      const name = singleModel.model_name || '';
      const plantStock = Number(singleModel.current_stock ?? 0);
      const totalStock = Number(singleModel.plant_breakdown?.total ?? plantStock);
      const mfg = singleModel.manufacturing_plant || 'E41 G2';

      let msg = `❄️ *JOSPO STOCK UPDATE: ${code}*\n`;
      msg += `📌 *Model:* ${name}\n`;
      msg += `🏭 *Mfg Facility:* ${mfg}\n`;
      msg += `📅 *Time:* ${timestampStr}\n`;
      msg += `👤 *Shared By:* ${userName}\n`;
      msg += `${divider}\n`;

      if (activePlant === ALL_PLANTS_ID) {
        msg += `📦 *Consolidated Stock:* *${totalStock.toLocaleString()} pcs*\n`;
        if (singleModel.plant_breakdown) {
          msg += `   • E41 G2: ${Number(singleModel.plant_breakdown['E41 G2'] || 0)} pcs\n`;
          msg += `   • D4 Plant: ${Number(singleModel.plant_breakdown['D4'] || 0)} pcs\n`;
          msg += `   • C116 Plant: ${Number(singleModel.plant_breakdown['C116'] || 0)} pcs\n`;
        }
      } else {
        msg += `📦 *Stock at ${activePlant}:* *${plantStock.toLocaleString()} pcs*\n`;
        msg += `🌐 *Total All Plants:* ${totalStock.toLocaleString()} pcs\n`;
      }

      if (customNote.trim()) {
        msg += `${divider}\n`;
        msg += `📝 *Note:* ${customNote.trim()}\n`;
      }

      msg += `${divider}\n`;
      msg += `_Generated via Jospo Enterprise ERP_`;
      return msg;
    }

    // CASE 2: Full Stock Overview / Summary
    const plantTitle =
      activePlant === ALL_PLANTS_ID ? '🌐 All Plants Consolidated' : `🏭 ${activePlant} Plant`;

    let msg = `📊 *JOSPO ENTERPRISE - STOCK REPORT*\n`;
    msg += `🏭 *Scope:* ${plantTitle}\n`;
    msg += `📅 *Date:* ${timestampStr}\n`;
    msg += `👤 *Prepared By:* ${userName}\n`;
    msg += `${divider}\n`;

    // Executive KPI Snapshot
    msg += `📈 *SUMMARY SNAPSHOT*\n`;
    msg += `• *Total On-Hand Stock:* *${Number(stats.totalStock || 0).toLocaleString()} units*\n`;
    if (stats.todayProduction !== undefined) {
      msg += `• *Today's Production:* ${Number(stats.todayProduction || 0).toLocaleString()} units\n`;
    }
    if (stats.todayDispatch !== undefined) {
      msg += `• *Today's Dispatch:* ${Number(stats.todayDispatch || 0).toLocaleString()} units\n`;
    }

    // Plant breakdown if consolidated
    if (activePlant === ALL_PLANTS_ID && plantTotals) {
      msg += `\n🏭 *Plant Breakdown:*\n`;
      msg += `  - E41 G2: ${(plantTotals['E41 G2'] || 0).toLocaleString()} pcs\n`;
      msg += `  - D4 Plant: ${(plantTotals['D4'] || 0).toLocaleString()} pcs\n`;
      msg += `  - C116 Plant: ${(plantTotals['C116'] || 0).toLocaleString()} pcs\n`;
    }

    // Models List selection
    let targetModels = [];
    if (reportMode === 'filtered') {
      targetModels = [...filteredStockList];
    } else if (reportMode === 'all') {
      targetModels = [...stockList];
    } else if (reportMode === 'in_stock') {
      targetModels = stockList.filter((m) => (Number(m.current_stock) || 0) > 0);
    } else if (reportMode === 'summary') {
      // Top 8 models by stock
      const sorted = [...stockList].sort(
        (a, b) => (Number(b.current_stock) || 0) - (Number(a.current_stock) || 0)
      );
      targetModels = sorted.slice(0, 8);
    }

    // Sort descending by stock
    targetModels.sort(
      (a, b) => (Number(b.current_stock) || 0) - (Number(a.current_stock) || 0)
    );

    if (targetModels.length > 0) {
      msg += `${divider}\n`;
      msg += `📦 *STOCK BY MODEL (${targetModels.length} models)*\n`;

      targetModels.forEach((m, idx) => {
        const qty = Number(m.current_stock || 0);
        const code = m.model_code || m.code || 'UNKNOWN';

        if (activePlant === ALL_PLANTS_ID && m.plant_breakdown) {
          const e41 = m.plant_breakdown['E41 G2'] || 0;
          const d4 = m.plant_breakdown['D4'] || 0;
          const c116 = m.plant_breakdown['C116'] || 0;
          msg += `${idx + 1}. *${code}*: *${qty.toLocaleString()} pcs* (E41:${e41} | D4:${d4} | C116:${c116})\n`;
        } else {
          msg += `${idx + 1}. *${code}*: *${qty.toLocaleString()} pcs*\n`;
        }
      });
    }

    // Zero stock alerts (if reportMode is summary or in_stock)
    if (reportMode === 'summary' || reportMode === 'in_stock') {
      const outOfStock = stockList.filter((m) => (Number(m.current_stock) || 0) <= 0);
      if (outOfStock.length > 0) {
        msg += `${divider}\n`;
        msg += `⚠️ *OUT OF STOCK (${outOfStock.length} models):*\n`;
        const zeroCodes = outOfStock.map((m) => m.model_code || m.code).slice(0, 10).join(', ');
        msg += `${zeroCodes}${outOfStock.length > 10 ? ` +${outOfStock.length - 10} more` : ''}\n`;
      }
    }

    if (customNote.trim()) {
      msg += `${divider}\n`;
      msg += `📝 *Note:* ${customNote.trim()}\n`;
    }

    msg += `${divider}\n`;
    msg += `_Generated via Jospo Enterprise ERP_`;

    return msg;
  }, [
    singleModel,
    stockList,
    filteredStockList,
    reportMode,
    stats,
    plantTotals,
    activePlant,
    userName,
    timestampStr,
    customNote,
  ]);

  // Handle WhatsApp Share Action
  const handleOpenWhatsApp = () => {
    const cleanPhone = sanitizePhoneNumber(phoneNumber);

    // Persist phone number if checked
    if (typeof window !== 'undefined') {
      try {
        if (rememberPhone && cleanPhone) {
          localStorage.setItem('jospo_owner_whatsapp_phone', phoneNumber.trim());
        } else if (!rememberPhone) {
          localStorage.removeItem('jospo_owner_whatsapp_phone');
        }
      } catch (e) {}
    }

    const encodedText = encodeURIComponent(generatedMessage);
    let url = '';
    if (cleanPhone) {
      url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${encodedText}`;
    }

    window.open(url, '_blank');
  };

  // Copy to clipboard
  const handleCopyMessage = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(generatedMessage);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-5 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 border border-emerald-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 text-lg shadow-xs">
              💬
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center space-x-1.5">
                <span>Share Stock to Owner</span>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  WhatsApp
                </span>
              </h3>
              <p className="text-xs text-gray-500">
                Send instant formatted inventory summary directly via WhatsApp.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg font-bold p-1 rounded-md"
          >
            ✕
          </button>
        </div>

        {/* Owner Phone Number Input */}
        <div className="bg-emerald-50/60 rounded-xl p-3.5 border border-emerald-200/80 space-y-2">
          <label className="block text-xs font-bold text-emerald-950">
            📱 Owner / Recipient WhatsApp Number (Optional)
          </label>
          <div className="flex items-center space-x-2">
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="e.g. 9826012345 or +91 98260..."
              className="input-field text-xs py-2 bg-white flex-1 font-mono font-medium"
            />
            {phoneNumber && (
              <button
                type="button"
                onClick={() => setPhoneNumber('')}
                className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 font-medium"
                title="Clear number"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-[11px] text-emerald-800">
            <label className="flex items-center space-x-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberPhone}
                onChange={(e) => setRememberPhone(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Remember this number on this device</span>
            </label>
            <span className="text-gray-500 text-[10px]">
              {phoneNumber ? 'Direct Send' : 'Will open WhatsApp contact picker'}
            </span>
          </div>
        </div>

        {/* Scope Selector (Only for Full Stock Share, not single model) */}
        {!singleModel && (
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700">
              📊 Report Content Scope
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setReportMode('in_stock')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition-all text-center ${
                  reportMode === 'in_stock'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-200'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div>✓ In-Stock Only</div>
                <div className={`text-[10px] font-normal ${reportMode === 'in_stock' ? 'text-emerald-100' : 'text-gray-400'}`}>
                  Stock &gt; 0 pcs
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReportMode('summary')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition-all text-center ${
                  reportMode === 'summary'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-200'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div>⚡ Snapshot</div>
                <div className={`text-[10px] font-normal ${reportMode === 'summary' ? 'text-emerald-100' : 'text-gray-400'}`}>
                  Top models + KPIs
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReportMode('filtered')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition-all text-center ${
                  reportMode === 'filtered'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-200'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div>🔍 Visible List</div>
                <div className={`text-[10px] font-normal ${reportMode === 'filtered' ? 'text-emerald-100' : 'text-gray-400'}`}>
                  Filtered ({filteredStockList.length})
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReportMode('all')}
                className={`py-2 px-2.5 rounded-lg text-xs font-bold border transition-all text-center ${
                  reportMode === 'all'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-200'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div>📦 All Catalog</div>
                <div className={`text-[10px] font-normal ${reportMode === 'all' ? 'text-emerald-100' : 'text-gray-400'}`}>
                  All {stockList.length} models
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Optional Custom Note */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            📝 Add Custom Note / Remarks (Optional)
          </label>
          <input
            type="text"
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            placeholder="e.g. Please approve dispatch for Jaipur route tomorrow morning"
            className="input-field text-xs py-1.5"
          />
        </div>

        {/* Live WhatsApp Message Preview */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-gray-700 flex items-center space-x-1.5">
              <span>Preview WhatsApp Message</span>
              <span className="text-[10px] font-normal text-gray-400">
                ({generatedMessage.length} chars)
              </span>
            </span>
            <button
              type="button"
              onClick={handleCopyMessage}
              className="text-xs text-primary-600 hover:text-primary-800 font-bold inline-flex items-center space-x-1"
            >
              <span>{copied ? '✅ Copied!' : '📋 Copy Text'}</span>
            </button>
          </div>
          <div className="bg-gray-900 text-gray-100 rounded-xl p-3.5 font-mono text-[11px] leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap select-all border border-gray-800 shadow-inner">
            {generatedMessage}
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary text-xs py-2 px-4"
          >
            Cancel
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleCopyMessage}
              className="btn-secondary text-xs py-2 px-3 inline-flex items-center space-x-1"
              title="Copy message text to clipboard"
            >
              <span>📋</span>
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="py-2 px-4 rounded-xl font-bold text-white text-xs bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg flex items-center space-x-2 transition-all transform active:scale-95"
            >
              <span className="text-sm">💬</span>
              <span>Open in WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
