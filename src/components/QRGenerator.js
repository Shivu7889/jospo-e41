'use client';

import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function QRGenerator({
  value,
  modelName = '',
  modelCode = '',
  size = 180,
  className = '',
}) {
  const labelRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const displayValue = value || (modelCode ? `JOSPO-${modelCode}` : 'JOSPO-SAMPLE');

  const handlePrint = () => {
    setPrinting(true);
    try {
      const printWindow = window.open('', '_blank', 'width=450,height=550');
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
            <title>Print QR Label - ${modelCode || 'Cooler'}</title>
            <meta charset="utf-8" />
            <style>
              @page {
                size: auto;
                margin: 10mm;
              }
              * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
              }
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                background-color: #ffffff;
                color: #111827;
                padding: 16px;
              }
              .label-card {
                border: 2px dashed #9ca3af;
                border-radius: 12px;
                padding: 24px;
                text-align: center;
                width: 280px;
                background: #ffffff;
                display: flex;
                flex-direction: column;
                align-items: center;
              }
              .qr-wrapper {
                margin: 0 auto 16px auto;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .qr-wrapper svg {
                width: 180px;
                height: 180px;
              }
              .model-name {
                font-size: 18px;
                font-weight: 700;
                color: #111827;
                margin-bottom: 4px;
                word-break: break-word;
              }
              .model-code {
                font-size: 15px;
                font-weight: 600;
                font-family: monospace;
                color: #4f46e5;
                margin-bottom: 8px;
                letter-spacing: 0.5px;
              }
              .qr-raw {
                font-size: 11px;
                font-family: monospace;
                color: #6b7280;
                margin-bottom: 12px;
                word-break: break-all;
              }
              .brand-divider {
                width: 100%;
                border-top: 1px solid #e5e7eb;
                margin: 8px 0;
              }
              .brand-tag {
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 1.5px;
                color: #9ca3af;
                text-transform: uppercase;
              }
            </style>
          </head>
          <body>
            <div class="label-card">
              <div class="qr-wrapper">
                ${svgHtml}
              </div>
              <div class="model-name">${modelName || 'Cooler Model'}</div>
              <div class="model-code">${modelCode || displayValue}</div>
              <div class="qr-raw">${displayValue}</div>
              <div class="brand-divider"></div>
              <div class="brand-tag">JOSPO E41</div>
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
        const scale = 2; // high-DPI crisp export
        const cardWidth = 320 * scale;
        const cardHeight = 440 * scale;

        canvas.width = cardWidth;
        canvas.height = cardHeight;
        const ctx = canvas.getContext('2d');

        // High quality scale
        ctx.scale(scale, scale);
        const w = 320;
        const h = 440;

        // Background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);

        // Dashed border
        ctx.strokeStyle = '#D1D5DB';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(12, 12, w - 24, h - 24);
        ctx.setLineDash([]);

        // Draw QR code
        const qrSize = 180;
        const qrX = (w - qrSize) / 2;
        const qrY = 32;
        ctx.drawImage(image, qrX, qrY, qrSize, qrSize);

        // Model Name
        ctx.textAlign = 'center';
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(modelName || 'Cooler Model', w / 2, qrY + qrSize + 34);

        // Model Code
        ctx.fillStyle = '#4F46E5';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(modelCode || displayValue, w / 2, qrY + qrSize + 60);

        // QR raw string
        ctx.fillStyle = '#6B7280';
        ctx.font = '11px monospace';
        ctx.fillText(displayValue, w / 2, qrY + qrSize + 82);

        // Separator line
        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(30, qrY + qrSize + 98);
        ctx.lineTo(w - 30, qrY + qrSize + 98);
        ctx.stroke();

        // Brand Footer
        ctx.fillStyle = '#9CA3AF';
        ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText('JOSPO E41', w / 2, qrY + qrSize + 120);

        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        const filename = `QR-${(modelCode || 'model').replace(/[^a-zA-Z0-9-_]/g, '_')}.png`;
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
        className="w-full max-w-[280px] bg-white rounded-2xl border-2 border-dashed border-gray-300 p-6 flex flex-col items-center text-center shadow-sm"
      >
        {/* QR Code SVG */}
        <div className="bg-white p-2 rounded-xl flex items-center justify-center shadow-inner ring-1 ring-gray-100">
          <QRCodeSVG
            value={displayValue}
            size={size}
            level="H"
            includeMargin={true}
            bgColor="#FFFFFF"
            fgColor="#111827"
          />
        </div>

        {/* Model Details */}
        <div className="mt-4 w-full">
          <h3 className="text-base font-bold text-gray-900 truncate" title={modelName}>
            {modelName || 'Cooler Model'}
          </h3>
          <p className="text-sm font-semibold text-primary-600 font-mono tracking-wide mt-0.5">
            {modelCode || '—'}
          </p>
          <p className="text-xs text-gray-400 font-mono mt-1 break-all px-1" title={displayValue}>
            {displayValue}
          </p>

          <div className="w-full border-t border-gray-200 my-3" />

          <p className="text-xs font-bold tracking-widest text-gray-400 uppercase">
            JOSPO E41
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 w-full max-w-[280px]">
        <button
          type="button"
          onClick={handlePrint}
          disabled={printing}
          className="btn-primary flex-1 text-xs py-2 inline-flex items-center justify-center space-x-1.5 shadow-sm"
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
          className="btn-secondary flex-1 text-xs py-2 inline-flex items-center justify-center space-x-1.5 shadow-sm"
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
