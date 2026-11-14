'use client';

import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function QRGenerator({
  value,
  modelName = '',
  modelCode = '',
  serialNumber: initialSerial = '000001',
  size = 190,
  className = '',
}) {
  const labelRef = useRef(null);
  const [serial, setSerial] = useState(initialSerial);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  // If a custom value was explicitly passed without serial, use it, otherwise generate unique serialized payload
  const effectiveSerial = (serial || '000001').padStart(6, '0');
  const baseCode = modelCode || 'MODEL';
  const nameToDisplay = modelName || (modelCode ? `Jospo ${modelCode}` : 'Cooler Model');
  
  // Format payload for BarTender / Jospo scanner: JSP|<Model>|<Serial> or JOSPO-<Code>-<Serial>
  const uniquePayload = value 
    ? (value.includes(effectiveSerial) ? value : `${value}-${effectiveSerial}`)
    : `JSP|${nameToDisplay}|${effectiveSerial}`;

  const handlePrint = () => {
    setPrinting(true);
    try {
      const printWindow = window.open('', '_blank', 'width=480,height=600');
      if (!printWindow) {
        alert('Please allow popups to print the QR label.');
        setPrinting(false);
        return;
      }

      const svgElement = labelRef.current?.querySelector('svg');
      const svgHtml = svgElement ? svgElement.outerHTML : '';

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>QR Label - ${nameToDisplay} (#${effectiveSerial})</title>
            <meta charset="utf-8" />
            <style>
              @page {
                size: auto;
                margin: 5mm;
              }
              * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                background-color: #ffffff;
                color: #000000;
                padding: 12px;
              }
              .label-card {
                border: 3px solid #000000;
                border-radius: 8px;
                padding: 20px 24px;
                text-align: center;
                width: 320px;
                background: #ffffff;
                display: flex;
                flex-direction: column;
                align-items: center;
              }
              .brand-header {
                font-size: 14px;
                font-weight: 800;
                letter-spacing: 1.5px;
                color: #000000;
                text-transform: uppercase;
                border-bottom: 2px solid #000000;
                width: 100%;
                padding-bottom: 6px;
                margin-bottom: 12px;
              }
              /* BIG AND DARK FONT FOR MODEL NAME */
              .model-name {
                font-size: 28px;
                font-weight: 900;
                color: #000000;
                line-height: 1.1;
                margin-bottom: 14px;
                text-transform: uppercase;
                word-break: break-word;
                letter-spacing: -0.5px;
              }
              .qr-wrapper {
                margin: 0 auto 12px auto;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .qr-wrapper svg {
                width: 190px;
                height: 190px;
              }
              /* PROMINENT SERIAL NUMBER */
              .serial-number {
                font-size: 22px;
                font-weight: 900;
                color: #000000;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                letter-spacing: 0.5px;
                margin-bottom: 6px;
                padding: 4px 12px;
                border: 2px solid #000000;
                border-radius: 6px;
                display: inline-block;
              }
              .qr-raw {
                font-size: 11px;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                font-weight: 600;
                color: #333333;
                margin-top: 6px;
                word-break: break-all;
              }
              .factory-footer {
                width: 100%;
                border-top: 1.5px solid #000000;
                margin-top: 12px;
                padding-top: 8px;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 1px;
                color: #000000;
                text-transform: uppercase;
              }
            </style>
          </head>
          <body>
            <div class="label-card">
              <div class="brand-header">JOSPO AIR COOLERS</div>
              <div class="model-name">${nameToDisplay}</div>
              <div class="qr-wrapper">
                ${svgHtml}
              </div>
              <div class="serial-number">SN: ${effectiveSerial}</div>
              <div class="qr-raw">${uniquePayload}</div>
              <div class="factory-footer">GENUINE FACTORY PACKED • UNIT E-41</div>
            </div>
            <script>
              window.onload = function() {
                window.focus();
                setTimeout(function() {
                  window.print();
                  window.close();
                }, 250);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (err) {
      console.error('Print error:', err);
    } finally {
      setPrinting(false);
    }
  };

  const handleDownload = () => {
    setDownloading(true);
    try {
      const svgElement = labelRef.current?.querySelector('svg');
      if (!svgElement) {
        throw new Error('QR SVG not found');
      }

      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URL = window.URL || window.webkitURL || window;
      const blobURL = URL.createObjectURL(svgBlob);

      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = 3; // 300 DPI ultra-crisp export
        const cardWidth = 340 * scale;
        const cardHeight = 490 * scale;

        canvas.width = cardWidth;
        canvas.height = cardHeight;
        const ctx = canvas.getContext('2d');

        ctx.scale(scale, scale);
        const w = 340;
        const h = 490;

        // Background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);

        // Solid Black Outer Border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeRect(8, 8, w - 16, h - 16);

        // Brand Header Box
        ctx.fillStyle = '#000000';
        ctx.fillRect(8, 8, w - 16, 36);
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('JOSPO AIR COOLERS • UNIT E-41', w / 2, 31);

        // BIG AND DARK MODEL NAME
        ctx.fillStyle = '#000000';
        ctx.font = '900 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(nameToDisplay.toUpperCase(), w / 2, 75);

        // Divider
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(24, 88);
        ctx.lineTo(w - 24, 88);
        ctx.stroke();

        // Draw QR code
        const qrSize = 190;
        const qrX = (w - qrSize) / 2;
        const qrY = 100;
        ctx.drawImage(image, qrX, qrY, qrSize, qrSize);

        // SERIAL NUMBER (BIG AND DARK)
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 22px monospace';
        ctx.fillText(`SN: ${effectiveSerial}`, w / 2, qrY + qrSize + 32);

        // Raw payload
        ctx.fillStyle = '#4B5563';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(uniquePayload, w / 2, qrY + qrSize + 52);

        // Footer banner
        ctx.fillStyle = '#000000';
        ctx.fillRect(8, h - 42, w - 16, 34);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('★ 100% GENUINE FACTORY PACKED ★', w / 2, h - 21);

        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        const safeModel = nameToDisplay.replace(/[^a-zA-Z0-9-_]/g, '_');
        const filename = `LABEL_${safeModel}_SN${effectiveSerial}.png`;
        downloadLink.download = filename;
        downloadLink.href = pngUrl;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        URL.revokeObjectURL(blobURL);
        setDownloading(false);
      };

      image.onerror = () => {
        setDownloading(false);
        alert('Could not generate PNG image.');
      };

      image.src = blobURL;
    } catch (err) {
      console.error('Download error:', err);
      setDownloading(false);
    }
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Printable Label Container */}
      <div
        ref={labelRef}
        className="w-full max-w-[320px] bg-white rounded-xl border-3 border-black p-5 flex flex-col items-center text-center shadow-lg"
        style={{ borderWidth: '3px', borderColor: '#000000' }}
      >
        {/* Brand Header */}
        <div className="w-full bg-black text-white text-[11px] font-black tracking-widest py-1 px-2 rounded-t-sm uppercase mb-3">
          JOSPO AIR COOLERS
        </div>

        {/* 1. MODEL NAME IN BIG AND DARK FONT */}
        <div className="w-full mb-3">
          <h2 className="text-2xl sm:text-3xl font-black text-black tracking-tight uppercase leading-tight line-clamp-2">
            {nameToDisplay}
          </h2>
          <div className="w-full h-0.5 bg-black mt-2" />
        </div>

        {/* 2. QR CODE */}
        <div className="bg-white p-2 rounded-lg flex items-center justify-center border-2 border-gray-200 shadow-sm mb-3">
          <QRCodeSVG
            value={uniquePayload}
            size={size}
            level="H"
            includeMargin={true}
            bgColor="#FFFFFF"
            fgColor="#000000"
          />
        </div>

        {/* 3. SERIAL NUMBER IN DARK BOLD FONT */}
        <div className="w-full">
          <div className="inline-block bg-black text-white px-3 py-1 rounded font-mono font-black text-lg tracking-wider">
            SN: {effectiveSerial}
          </div>
          <p className="text-[11px] font-mono font-bold text-gray-700 mt-1.5 break-all px-1" title={uniquePayload}>
            {uniquePayload}
          </p>

          <div className="w-full border-t border-black my-2.5" />

          <p className="text-[10px] font-extrabold tracking-widest text-black uppercase">
            GENUINE FACTORY PACKED • UNIT E-41
          </p>
        </div>
      </div>

      {/* Serial Number Selector Controls */}
      <div className="mt-4 w-full max-w-[320px] bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between gap-2">
        <label className="text-xs font-bold text-gray-700 whitespace-nowrap">
          Serial #:
        </label>
        <div className="flex items-center space-x-1 flex-1">
          <input
            type="text"
            value={serial}
            onChange={(e) => setSerial(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
            placeholder="000001"
            className="w-full text-center font-mono font-bold text-sm bg-white border border-gray-300 rounded-md py-1 px-2 text-black focus:outline-none focus:ring-2 focus:ring-black"
          />
          <button
            type="button"
            onClick={() => {
              const currentNum = parseInt(serial || '0', 10);
              setSerial(String(currentNum + 1).padStart(6, '0'));
            }}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold px-2 py-1 rounded transition-colors"
            title="Next serial number (+1)"
          >
            +1
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5 w-full max-w-[320px]">
        <button
          type="button"
          onClick={handlePrint}
          disabled={printing}
          className="btn-primary flex-1 text-xs py-2.5 inline-flex items-center justify-center space-x-1.5 shadow-sm bg-black hover:bg-gray-800 text-white font-bold"
          title="Print label"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4H7v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
            />
          </svg>
          <span>{printing ? 'Preparing...' : 'Print Label'}</span>
        </button>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="btn-secondary flex-1 text-xs py-2.5 inline-flex items-center justify-center space-x-1.5 shadow-sm border-2 border-black text-black font-bold hover:bg-gray-100"
          title="Download PNG"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          <span>{downloading ? 'Exporting...' : 'Save PNG'}</span>
        </button>
      </div>
    </div>
  );
}

