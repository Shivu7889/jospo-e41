const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const defaultModels = [
  { name: 'Jospo J-50', code: 'J-50', qr: 'JOSPO-J50', desc: '50L Honeycomb Air Cooler' },
  { name: 'Jospo J-75', code: 'J-75', qr: 'JOSPO-J75', desc: '75L Honeycomb Air Cooler' },
  { name: 'Jospo J-100', code: 'J-100', qr: 'JOSPO-J100', desc: '100L Desert Air Cooler' },
  { name: 'Jospo J-125', code: 'J-125', qr: 'JOSPO-J125', desc: '125L Desert Air Cooler' },
  { name: 'Jospo J-150', code: 'J-150', qr: 'JOSPO-J150', desc: '150L Heavy Duty Desert Cooler' },
  { name: 'Jospo J-175', code: 'J-175', qr: 'JOSPO-J175', desc: '175L Commercial Air Cooler' },
  { name: 'Jospo J-200', code: 'J-200', qr: 'JOSPO-J200', desc: '200L Industrial Air Cooler' },
  { name: 'Jospo J-250', code: 'J-250', qr: 'JOSPO-J250', desc: '250L Industrial Air Cooler' },
  { name: 'Jospo J-300', code: 'J-300', qr: 'JOSPO-J300', desc: '300L Mega Industrial Air Cooler' },
  { name: 'Jospo J-350', code: 'J-350', qr: 'JOSPO-J350', desc: '350L Duct Industrial Cooler' },
  { name: 'Jospo J-400', code: 'J-400', qr: 'JOSPO-J400', desc: '400L Plant Duct Cooler' },
  { name: 'Jospo J-500', code: 'J-500', qr: 'JOSPO-J500', desc: '500L Factory Heavy Duty Cooler' },
];

async function generate() {
  const outputDir = path.join(__dirname, '..', 'public', 'qr-codes');
  const zipPath = path.join(__dirname, '..', 'public', 'jospo-all-qr-codes.zip');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const zip = new JSZip();
  const htmlCards = [];

  console.log(`Generating QR codes for ${defaultModels.length} models...`);

  for (const model of defaultModels) {
    const filenamePng = `QR_${model.code.replace(/[^A-Z0-9-]/gi, '_')}.png`;
    const filenameSvg = `QR_${model.code.replace(/[^A-Z0-9-]/gi, '_')}.svg`;
    const filePathPng = path.join(outputDir, filenamePng);
    const filePathSvg = path.join(outputDir, filenameSvg);

    // 1. Generate high-res PNG (512x512)
    const pngBuffer = await QRCode.toBuffer(model.qr, {
      type: 'png',
      width: 512,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });
    fs.writeFileSync(filePathPng, pngBuffer);
    zip.file(`png/${filenamePng}`, pngBuffer);

    // 2. Generate SVG for vector printing
    const svgString = await QRCode.toString(model.qr, {
      type: 'svg',
      width: 512,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });
    fs.writeFileSync(filePathSvg, svgString);
    zip.file(`svg/${filenameSvg}`, svgString);

    // Generate base64 for HTML printable sheet
    const base64Data = pngBuffer.toString('base64');
    htmlCards.push(`
      <div class="label-card">
        <div class="brand">JOSPO E41</div>
        <div class="model-name">${model.name}</div>
        <img class="qr-img" src="data:image/png;base64,${base64Data}" alt="${model.name} QR" />
        <div class="model-code">MODEL: ${model.code}</div>
        <div class="qr-payload">${model.qr}</div>
        <div class="specs">${model.desc}</div>
      </div>
    `);

    console.log(`✓ Generated ${model.code} -> ${model.qr}`);
  }

  // 3. Create ready-to-print A4 sheet HTML
  const printableHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Jospo E41 - Printable Cooler QR Labels</title>
  <style>
    @page {
      size: A4;
      margin: 10mm;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 10px;
      background: #f8fafc;
      color: #0f172a;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      color: #1e3a8a;
    }
    .header p {
      margin: 4px 0 0 0;
      font-size: 13px;
      color: #64748b;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 15px;
    }
    .label-card {
      background: #ffffff;
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      padding: 16px;
      text-align: center;
      page-break-inside: avoid;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .brand {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 1.5px;
      color: #4f46e5;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .model-name {
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 10px;
    }
    .qr-img {
      width: 160px;
      height: 160px;
      margin: 0 auto;
      display: block;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 6px;
      background: #ffffff;
    }
    .model-code {
      font-size: 13px;
      font-weight: 800;
      color: #1e293b;
      margin-top: 10px;
      font-family: monospace;
    }
    .qr-payload {
      font-size: 11px;
      font-family: monospace;
      color: #64748b;
      background: #f1f5f9;
      padding: 3px 6px;
      border-radius: 4px;
      display: inline-block;
      margin-top: 4px;
    }
    .specs {
      font-size: 10px;
      color: #94a3b8;
      margin-top: 6px;
    }
    .print-btn {
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4f46e5;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    @media print {
      body { background: white; padding: 0; }
      .print-btn { display: none; }
      .label-card { border: 2px solid #94a3b8; box-shadow: none; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Print Labels</button>
  <div class="header">
    <h1>JOSPO E41 MANUFACTURING UNIT</h1>
    <p>Official Cooler Model QR Dispatch Labels (Scan to count +1 unit)</p>
  </div>
  <div class="grid">
    ${htmlCards.join('')}
  </div>
</body>
</html>`;

  const sheetPath = path.join(outputDir, 'printable-labels-sheet.html');
  fs.writeFileSync(sheetPath, printableHtml);
  zip.file('printable-labels-sheet.html', printableHtml);

  // 4. Generate README inside ZIP
  const readmeContent = `# Jospo E41 - Cooler Model QR Labels Archive

This folder contains high-resolution QR codes for all Jospo cooler models.

## How Dispatch QR Scanning Works:
- Each cooler model has its own QR code label.
- When dispatching, the staff scans the label using their mobile camera in the Jospo Dispatch module.
- Each scan adds +1 unit of that model to the vehicle manifest.
- Scanning the same label 10 times counts 10 coolers.

## Folder Contents:
- /png/ - High-resolution PNG images (512x512) for graphic designers or direct printing.
- /svg/ - Vector SVG images for industrial sticker printers.
- printable-labels-sheet.html - Open in Chrome / Safari and press (Cmd+P / Ctrl+P) to print all labels directly onto A4 sticker paper!

Generated on: ${new Date().toLocaleString()}
Unit: Jospo E41 Manufacturing Unit
`;
  zip.file('README.txt', readmeContent);

  // 5. Save ZIP file
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(zipPath, zipBuffer);
  console.log(`\n🎉 ZIP archive created successfully at: ${zipPath} (${(zipBuffer.length / 1024).toFixed(1)} KB)`);
}

generate().catch(console.error);
