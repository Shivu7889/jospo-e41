const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

// EXACT 20 MODELS
const exactModels = [
  { code: 'ICECOOL-55-CG-WG', name: 'Jospo Icecool 55 CG WG', specs: '55L, CG', qrBase: 'JOSPO-ICECOOL55CGWG' },
  { code: 'ICECOOL-55-NCG-WG', name: 'Jospo Icecool 55 NCG WG', specs: '55L, NCG', qrBase: 'JOSPO-ICECOOL55LNCGWG' },
  { code: 'ICECOOL-65-CG-WG', name: 'Jospo Icecool 65 CG WG', specs: '65L, CG', qrBase: 'JOSPO-ICECOOL65LCGWG' },
  { code: 'ICECOOL-65-NCG-WG', name: 'Jospo Icecool 65 NCG WG', specs: '65L, NCG', qrBase: 'JOSPO-ICECOOL65LNCGWG' },
  { code: 'NEO-100-CG-WG', name: 'Jospo Neo 100 CG WG', specs: '100L, CG', qrBase: 'JOSPO-NEO100CGWG' },
  { code: 'NEO-100-NCG-WG', name: 'Jospo Neo 100 NCG WG', specs: '100L, NCG', qrBase: 'JOSPO-NEO100NCGWG' },
  { code: 'NEO-80-CG-WG', name: 'Jospo Neo 80 CG WG', specs: '80L, CG', qrBase: 'JOSPO-NEO80CGWG' },
  { code: 'NEO-80-NCG-WG', name: 'Jospo Neo 80 NCG WG', specs: '80L, NCG', qrBase: 'JOSPO-NEO80NCGWG' },
  { code: 'ROLEX-35-CG-DG', name: 'Jospo Rolex 35 CG DG', specs: '35L, CG', qrBase: 'JOSPO-ROLEX35CGDG' },
  { code: 'ROLEX-35-CG-WG', name: 'Jospo Rolex 35 CG WG', specs: '35L, CG', qrBase: 'JOSPO-ROLEX35CGWG' },
  { code: 'ROLEX-35-NCG-DG', name: 'Jospo Rolex 35 NCG DG', specs: '35L, NCG', qrBase: 'JOSPO-ROLEX35NCGDG' },
  { code: 'ROLEX-35-NCG-WG', name: 'Jospo Rolex 35 NCG WG', specs: '35L, NCG', qrBase: 'JOSPO-ROLEX35NCGWG' },
  { code: 'ROLEX-65-CG-DG', name: 'Jospo Rolex 65 CG DG', specs: '65L, CG', qrBase: 'JOSPO-ROLEX65CGDG' },
  { code: 'ROLEX-65-CG-WG', name: 'Jospo Rolex 65 CG WG', specs: '65L, CG', qrBase: 'JOSPO-ROLEX65CGWG' },
  { code: 'ROLEX-65-NCG-DG', name: 'Jospo Rolex 65 NCG DG', specs: '65L, DG', qrBase: 'JOSPO-ROLEX65NCGDG' },
  { code: 'ROLEX-65-NCG-WG', name: 'Jopso Rolex 65 NCG WG', specs: '65L, NCG', qrBase: 'JOSPO-JOPSOROLEX65NCGWG' },
  { code: 'SHINE-100-CG-WG', name: 'Jospo Shine 100 CG WG', specs: '100L, CG', qrBase: 'JOSPO-SHINE100CGWG' },
  { code: 'SHINE-100-NCG-WG', name: 'Jospo Shine 100 NCG WG', specs: '100L, NCG', qrBase: 'JOSPO-SHINE100NCGWG' },
  { code: 'SHINE-80-CG-WG', name: 'Jospo Shine 80 CG WG', specs: '80L, CG', qrBase: 'JOSPO-SHINE80CGWG' },
  { code: 'SHINE-80-NCG-WG', name: 'Jospo Shine 80 NCG WG', specs: '80L, NCG', qrBase: 'JOSPO-SHINE80NCGWG' },
];

async function generateBarTenderSamples() {
  const outputDir = path.join(__dirname, '..', 'public', 'bartender-sample');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Generate CSV data template for BarTender
  const csvLines = [
    'Model_Name,Model_Code,Serial_Number,QR_Payload,Specs,Manufacturing_Unit,Created_Date',
  ];

  const htmlCards = [];

  for (const m of exactModels) {
    const serial = '000001';
    const qrPayload = `JSP|${m.name}|${serial}`;
    const filenamePng = `QR_${m.code}_${serial}.png`;
    const filePathPng = path.join(outputDir, filenamePng);

    // High res PNG for BarTender test
    const pngBuffer = await QRCode.toBuffer(qrPayload, {
      type: 'png',
      width: 512,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'H',
    });
    fs.writeFileSync(filePathPng, pngBuffer);

    csvLines.push(
      `"${m.name}","${m.code}","${serial}","${qrPayload}","${m.specs}","Jospo E41","${new Date().toISOString().split('T')[0]}"`
    );

    const base64Data = pngBuffer.toString('base64');
    htmlCards.push(`
      <div class="label-card">
        <div class="brand">JOSPO AIR COOLERS • ${m.specs}</div>
        <!-- 1. MODEL NAME IN BIG AND DARK FONT -->
        <div class="model-title">${m.name}</div>
        <div class="model-code-tag">${m.code}</div>
        <div class="divider"></div>
        <!-- 2. QR CODE -->
        <img class="qr-preview" src="data:image/png;base64,${base64Data}" alt="QR ${qrPayload}" />
        <!-- 3. SERIAL NUMBER IN DARK BOLD FONT -->
        <div class="serial-badge">SN: ${serial}</div>
        <div class="qr-payload-text">${qrPayload}</div>
        <div class="footer-tag">GENUINE FACTORY PACKED • UNIT E-41</div>
      </div>
    `);

    console.log(`✓ Created unique QR for: ${m.code}`);
  }

  // Write CSV file
  const csvPath = path.join(outputDir, 'jospo_20_models_template.csv');
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.log(`✓ BarTender 20 Models CSV template created at: ${csvPath}`);

  // Write HTML Interactive Preview Page
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Jospo E41 - 20 Cooler Models BarTender Labels</title>
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
      max-width: 1100px;
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
      letter-spacing: 0.5px;
      color: #ffffff;
      background: #000000;
      padding: 3px 6px;
      border-radius: 4px;
      margin-bottom: 8px;
      text-transform: uppercase;
    }
    .model-title {
      font-size: 20px;
      font-weight: 900;
      color: #000000;
      text-transform: uppercase;
      line-height: 1.15;
      letter-spacing: -0.5px;
      margin: 6px 0 2px 0;
      word-break: break-word;
    }
    .model-code-tag {
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 800;
      color: #475569;
    }
    .divider {
      height: 2px;
      background: #000000;
      width: 100%;
      margin: 6px 0 10px 0;
    }
    .qr-preview {
      width: 160px;
      height: 160px;
      margin: 0 auto;
      display: block;
      border: 1px solid #e2e8f0;
      background: white;
    }
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
      <span class="badge">Jospo Air Coolers • Exact 20 Models</span>
      <h1>Production QR Labels for All 20 Active Models</h1>
      <p>
        These labels match your exact 20 production cooler models with <strong>BIG & DARK Model Names</strong>, <strong>high-contrast QR codes</strong>, and <strong>sequential Serial Numbers</strong>.
      </p>

      <div class="action-links">
        <a href="ALL_20_MODELS_100x50mm_LABELS.pdf" target="_blank" class="btn">
          📄 Open Multi-Page PDF (All 20 Models)
        </a>
        <a href="/jospo_20_models_bartender_package.zip" download class="btn btn-secondary">
          📦 Download 20 Models Complete Package (.ZIP)
        </a>
        <button onclick="window.print()" class="btn btn-secondary">
          🖨️ Print Labels Sheet
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
  console.log(`✓ Interactive sample page updated at: ${htmlPath}`);
}

generateBarTenderSamples().catch(console.error);
