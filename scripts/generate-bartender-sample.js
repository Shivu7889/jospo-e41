const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const sampleSerials = [
  { modelName: 'Jospo J-50', modelCode: 'J-50', serial: '000001', qrPayload: 'JOSPO-J50-000001', batch: 'B-2026-11' },
  { modelName: 'Jospo J-50', modelCode: 'J-50', serial: '000002', qrPayload: 'JOSPO-J50-000002', batch: 'B-2026-11' },
  { modelName: 'Jospo J-50', modelCode: 'J-50', serial: '000003', qrPayload: 'JOSPO-J50-000003', batch: 'B-2026-11' },
  { modelName: 'Jospo J-75', modelCode: 'J-75', serial: '000001', qrPayload: 'JOSPO-J75-000001', batch: 'B-2026-11' },
  { modelName: 'Jospo J-75', modelCode: 'J-75', serial: '000002', qrPayload: 'JOSPO-J75-000002', batch: 'B-2026-11' },
  { modelName: 'Jospo J-100', modelCode: 'J-100', serial: '000001', qrPayload: 'JOSPO-J100-000001', batch: 'B-2026-11' },
  { modelName: 'Jospo J-100', modelCode: 'J-100', serial: '000002', qrPayload: 'JOSPO-J100-000002', batch: 'B-2026-11' },
  { modelName: 'Jospo J-125', modelCode: 'J-125', serial: '000001', qrPayload: 'JOSPO-J125-000001', batch: 'B-2026-11' },
];

async function generateBarTenderSamples() {
  const outputDir = path.join(__dirname, '..', 'public', 'bartender-sample');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Generate CSV data template for BarTender
  const csvLines = [
    'Model_Name,Model_Code,Serial_Number,QR_Payload,Batch_Number,Manufacturing_Unit,Created_Date',
  ];

  const htmlCards = [];

  for (const s of sampleSerials) {
    const filenamePng = `QR_${s.modelCode}_${s.serial}.png`;
    const filePathPng = path.join(outputDir, filenamePng);

    // High res PNG for BarTender test
    const pngBuffer = await QRCode.toBuffer(s.qrPayload, {
      type: 'png',
      width: 512,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });
    fs.writeFileSync(filePathPng, pngBuffer);

    csvLines.push(
      `"${s.modelName}","${s.modelCode}","${s.serial}","${s.qrPayload}","${s.batch}","Jospo E41","${new Date().toISOString().split('T')[0]}"`
    );

    const base64Data = pngBuffer.toString('base64');
    htmlCards.push(`
      <div class="label-card">
        <div class="brand">JOSPO AIR COOLERS • UNIT E-41</div>
        <div class="model-title">${s.modelName}</div>
        <img class="qr-preview" src="data:image/png;base64,${base64Data}" alt="QR ${s.qrPayload}" />
        <div class="serial-badge">SERIAL: #${s.serial}</div>
        <div class="qr-payload-text">QR: ${s.qrPayload}</div>
        <div class="meta-row">
          <span>Batch: ${s.batch}</span> • <span>MFG: 2026</span>
        </div>
      </div>
    `);

    console.log(`✓ Created unique QR: ${s.qrPayload}`);
  }

  // Write CSV file
  const csvPath = path.join(outputDir, 'jospo_bartender_template.csv');
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`✓ BarTender CSV template created at: ${csvPath}`);

  // Write HTML Interactive Preview Page
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Jospo E41 - BarTender Unique QR Code Sample Sheet</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      background: #f1f5f9;
      color: #0f172a;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
    }
    .header-box {
      background: white;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      margin-bottom: 24px;
      border: 1px solid #e2e8f0;
    }
    .badge {
      display: inline-block;
      background: #e0e7ff;
      color: #4338ca;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 24px;
      color: #1e1b4b;
    }
    p {
      margin: 0 0 16px 0;
      color: #475569;
      font-size: 14px;
      line-height: 1.5;
    }
    .test-instruction {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 12px 16px;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
      color: #1e40af;
      margin-bottom: 16px;
    }
    .action-links {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #4f46e5;
      color: white;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 8px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }
    .btn:hover { background: #4338ca; }
    .btn-secondary {
      background: white;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .btn-secondary:hover { background: #f8fafc; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
    }
    .label-card {
      background: white;
      border: 2px solid #cbd5e1;
      border-radius: 12px;
      padding: 16px;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.03);
      transition: transform 0.15s, border-color 0.15s;
    }
    .label-card:hover {
      border-color: #6366f1;
      transform: translateY(-2px);
    }
    .brand {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #4f46e5;
      margin-bottom: 4px;
    }
    .model-title {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 8px;
    }
    .qr-preview {
      width: 150px;
      height: 150px;
      margin: 0 auto;
      display: block;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 4px;
      background: white;
    }
    .serial-badge {
      margin-top: 10px;
      font-size: 12px;
      font-weight: 800;
      font-family: monospace;
      background: #f8fafc;
      color: #0f172a;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      display: inline-block;
    }
    .qr-payload-text {
      margin-top: 4px;
      font-size: 10px;
      font-family: monospace;
      color: #64748b;
    }
    .meta-row {
      margin-top: 6px;
      font-size: 10px;
      color: #94a3b8;
    }
    @media print {
      body { background: white; padding: 0; }
      .header-box { display: none; }
      .grid { gap: 10px; }
      .label-card { border: 1.5px solid #000; box-shadow: none; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-box">
      <span class="badge">BarTender Software Integration</span>
      <h1>Jospo E41 — Unique QR Code Sample Sheet</h1>
      <p>
        Each cooler box label contains its own unique sequential number generated by BarTender (e.g. <code>JOSPO-J50-000001</code>).
      </p>

      <div class="test-instruction">
        <strong>⚡ Live Duplicate Prevention Test:</strong>
        <ol style="margin: 6px 0 0 0; padding-left: 20px;">
          <li>Open <strong>New Dispatch</strong> on your phone or laptop camera.</li>
          <li>Scan <strong>Box #000001</strong> above: The app accepts it and counts <strong>+1</strong> unit!</li>
          <li>Now scan the <strong>exact same Box #000001</strong> again: The app will immediately block it and sound a buzzer with: <em>"⚠️ DUPLICATE BOX! Unit #000001 has already been scanned in this truck!"</em></li>
          <li>Now scan <strong>Box #000002</strong>: It accepts it as a new unit!</li>
        </ol>
      </div>

      <div class="action-links">
        <a href="jospo_bartender_template.csv" download="jospo_bartender_template.csv" class="btn">
          📥 Download BarTender CSV Template
        </a>
        <button onclick="window.print()" class="btn btn-secondary">
          🖨️ Print Label Sheet
        </button>
      </div>
    </div>

    <div class="grid">
      ${htmlCards.join('')}
    </div>
  </div>
</body>
</html>`;

  const htmlPath = path.join(outputDir, 'sample-unique-labels.html');
  fs.writeFileSync(htmlPath, htmlContent);
  console.log(`✓ Interactive sample page created at: ${htmlPath}`);
}

generateBarTenderSamples().catch(console.error);
