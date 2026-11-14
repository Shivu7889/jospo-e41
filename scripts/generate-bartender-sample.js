const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// Models featuring actual Jospo factory models + serials
const sampleSerials = [
  { modelName: 'Rolex 35 CG WG', modelCode: 'ROLEX-35', serial: '000001', qrPayload: 'JSP|Rolex 35 CG WG|000001', batch: 'B-2026-11' },
  { modelName: 'Rolex 35 CG WG', modelCode: 'ROLEX-35', serial: '000002', qrPayload: 'JSP|Rolex 35 CG WG|000002', batch: 'B-2026-11' },
  { modelName: 'Defender 110', modelCode: 'DEFENDER-110', serial: '000001', qrPayload: 'JSP|Defender 110|000001', batch: 'B-2026-11' },
  { modelName: 'Defender 110', modelCode: 'DEFENDER-110', serial: '000002', qrPayload: 'JSP|Defender 110|000002', batch: 'B-2026-11' },
  { modelName: 'IceCool 65', modelCode: 'ICECOOL-65', serial: '000001', qrPayload: 'JSP|IceCool 65|000001', batch: 'B-2026-11' },
  { modelName: 'Maxx 125', modelCode: 'MAXX-125', serial: '000001', qrPayload: 'JSP|Maxx 125|000001', batch: 'B-2026-11' },
  { modelName: 'Neo 100', modelCode: 'NEO-100', serial: '000001', qrPayload: 'JSP|Neo 100|000001', batch: 'B-2026-11' },
  { modelName: 'Jospo J-50', modelCode: 'J-50', serial: '000001', qrPayload: 'JOSPO-J50-000001', batch: 'B-2026-11' },
  { modelName: 'Jospo J-50', modelCode: 'J-50', serial: '000002', qrPayload: 'JOSPO-J50-000002', batch: 'B-2026-11' },
];

async function generateBarTenderSamples() {
  const outputDir = path.join(__dirname, '..', 'public', 'bartender-sample');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Copy PDF from bartender_labels_100x50 if it exists
  const srcPdf = path.join(__dirname, '..', 'bartender_labels_100x50', 'ALL_MODELS_100x50mm_LABELS.pdf');
  const destPdf = path.join(outputDir, 'ALL_MODELS_100x50mm_LABELS.pdf');
  if (fs.existsSync(srcPdf)) {
    fs.copyFileSync(srcPdf, destPdf);
    console.log(`✓ Copied master PDF to: ${destPdf}`);
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
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
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
        <!-- 1. MODEL NAME IN BIG AND DARK FONT -->
        <div class="model-title">${s.modelName}</div>
        <div class="divider"></div>
        <!-- 2. QR CODE -->
        <img class="qr-preview" src="data:image/png;base64,${base64Data}" alt="QR ${s.qrPayload}" />
        <!-- 3. SERIAL NUMBER IN DARK BOLD FONT -->
        <div class="serial-badge">SN: ${s.serial}</div>
        <div class="qr-payload-text">${s.qrPayload}</div>
        <div class="footer-tag">GENUINE FACTORY PACKED</div>
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
  <title>Jospo E41 - BarTender Labels with Big Dark Font & Serials</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      background: #f8fafc;
      color: #000000;
    }
    .container {
      max-width: 1040px;
      margin: 0 auto;
    }
    .header-box {
      background: white;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
      margin-bottom: 24px;
      border: 1px solid #e2e8f0;
    }
    .badge {
      display: inline-block;
      background: #000000;
      color: #ffffff;
      font-size: 11px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 26px;
      font-weight: 900;
      color: #000000;
      letter-spacing: -0.5px;
    }
    p {
      margin: 0 0 16px 0;
      color: #334155;
      font-size: 14px;
      line-height: 1.5;
    }
    .test-instruction {
      background: #f1f5f9;
      border-left: 4px solid #000000;
      padding: 14px 18px;
      border-radius: 0 8px 8px 0;
      font-size: 13px;
      color: #0f172a;
      margin-bottom: 18px;
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
      background: #000000;
      color: white;
      text-decoration: none;
      font-size: 13px;
      font-weight: 700;
      padding: 9px 18px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.15);
      border: none;
      cursor: pointer;
    }
    .btn:hover { background: #333333; }
    .btn-secondary {
      background: white;
      color: #000000;
      border: 2px solid #000000;
    }
    .btn-secondary:hover { background: #f1f5f9; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 20px;
    }
    /* LABEL CARD DESIGN: CRISP, INDUSTRIAL, THERMAL STICKER LOOK */
    .label-card {
      background: white;
      border: 3px solid #000000;
      border-radius: 10px;
      padding: 16px;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
      transition: transform 0.15s, box-shadow 0.15s;
      page-break-inside: avoid;
    }
    .label-card:hover {
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      transform: translateY(-2px);
    }
    .brand {
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 1px;
      color: #ffffff;
      background: #000000;
      padding: 3px 0;
      border-radius: 4px;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    /* BIG AND DARK FONT FOR MODEL NAME */
    .model-title {
      font-size: 24px;
      font-weight: 900;
      color: #000000;
      text-transform: uppercase;
      line-height: 1.1;
      letter-spacing: -0.5px;
      margin: 8px 0;
      word-break: break-word;
    }
    .divider {
      height: 2px;
      background: #000000;
      width: 100%;
      margin: 6px 0 10px 0;
    }
    .qr-preview {
      width: 170px;
      height: 170px;
      margin: 0 auto;
      display: block;
      border: 1px solid #e2e8f0;
      background: white;
    }
    /* SERIAL NUMBER IN DARK BOLD FONT */
    .serial-badge {
      margin-top: 10px;
      font-size: 18px;
      font-weight: 900;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #000000;
      color: #ffffff;
      padding: 4px 14px;
      border-radius: 6px;
      display: inline-block;
      letter-spacing: 0.5px;
    }
    .qr-payload-text {
      margin-top: 6px;
      font-size: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 700;
      color: #333333;
      word-break: break-all;
    }
    .footer-tag {
      margin-top: 10px;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 1px;
      color: #000000;
      border-top: 1px solid #000000;
      padding-top: 6px;
      text-transform: uppercase;
    }
    @media print {
      body { background: white; padding: 0; }
      .header-box { display: none; }
      .grid { gap: 12px; }
      .label-card { border: 3px solid #000000; box-shadow: none; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header-box">
      <span class="badge">Jospo Air Coolers • Label Standard</span>
      <h1>Production QR Labels: Big Dark Model Name & Serial Number</h1>
      <p>
        These labels are generated with <strong>Model Name in BIG, DARK, HEAVY font</strong>, large high-contrast <strong>QR code</strong>, and bold <strong>Serial Number</strong>.
      </p>

      <div class="test-instruction">
        <strong>⚡ Live Duplicate Prevention Test:</strong>
        <ol style="margin: 6px 0 0 0; padding-left: 20px; line-height: 1.6;">
          <li>Open <strong>New Dispatch</strong> on your phone camera: <code>/dispatch/new</code></li>
          <li>Scan <strong>Rolex 35 CG WG #000001</strong>: accepted as <strong>+1 unit</strong>!</li>
          <li>Scan the <strong>same box #000001</strong> again: immediate <strong>DUPLICATE WARNING BUZZER</strong>!</li>
          <li>Scan <strong>Rolex 35 CG WG #000002</strong>: accepted as a new unit!</li>
        </ol>
      </div>

      <div class="action-links">
        <a href="ALL_MODELS_100x50mm_LABELS.pdf" target="_blank" class="btn">
          📄 Open Multi-Page PDF (All 25 Models)
        </a>
        <a href="jospo_bartender_template.csv" download="jospo_bartender_template.csv" class="btn btn-secondary">
          📥 Download BarTender CSV
        </a>
        <button onclick="window.print()" class="btn btn-secondary">
          🖨️ Print This Sheet
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
