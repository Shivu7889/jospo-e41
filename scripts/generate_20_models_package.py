import os
import csv
import subprocess
import zipfile
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUTPUT_DIR = os.path.join(BASE_DIR, 'bartender_20_models')
INDIV_DIR = os.path.join(OUTPUT_DIR, 'individual_models')
BTXML_DIR = os.path.join(OUTPUT_DIR, 'btxml_automation')
TSPL_DIR = os.path.join(OUTPUT_DIR, 'tspl_direct_print')
PNG_DIR = os.path.join(OUTPUT_DIR, 'sample_labels_png')
PUBLIC_SAMPLE_DIR = os.path.join(BASE_DIR, 'public', 'bartender-sample')
PDF_PATH = os.path.join(OUTPUT_DIR, 'EXACT_20_MODELS_100x50mm_LABELS.pdf')
ZIP_PATH = os.path.join(BASE_DIR, 'public', 'jospo_20_models_bartender_package.zip')
LEGACY_ZIP_PATH = os.path.join(BASE_DIR, 'public', 'jospo_bartender_100x50mm_package.zip')

for d in [OUTPUT_DIR, INDIV_DIR, BTXML_DIR, TSPL_DIR, PNG_DIR, PUBLIC_SAMPLE_DIR]:
    os.makedirs(d, exist_ok=True)

# EXACT 20 MODELS
exact_models = [
    {"code": "ICECOOL-55-CG-WG", "name": "Jospo Icecool 55 CG WG", "specs": "55L, CG", "qr_base": "JOSPO-ICECOOL55CGWG"},
    {"code": "ICECOOL-55-NCG-WG", "name": "Jospo Icecool 55 NCG WG", "specs": "55L, NCG", "qr_base": "JOSPO-ICECOOL55LNCGWG"},
    {"code": "ICECOOL-65-CG-WG", "name": "Jospo Icecool 65 CG WG", "specs": "65L, CG", "qr_base": "JOSPO-ICECOOL65LCGWG"},
    {"code": "ICECOOL-65-NCG-WG", "name": "Jospo Icecool 65 NCG WG", "specs": "65L, NCG", "qr_base": "JOSPO-ICECOOL65LNCGWG"},
    {"code": "NEO-100-CG-WG", "name": "Jospo Neo 100 CG WG", "specs": "100L, CG", "qr_base": "JOSPO-NEO100CGWG"},
    {"code": "NEO-100-NCG-WG", "name": "Jospo Neo 100 NCG WG", "specs": "100L, NCG", "qr_base": "JOSPO-NEO100NCGWG"},
    {"code": "NEO-80-CG-WG", "name": "Jospo Neo 80 CG WG", "specs": "80L, CG", "qr_base": "JOSPO-NEO80CGWG"},
    {"code": "NEO-80-NCG-WG", "name": "Jospo Neo 80 NCG WG", "specs": "80L, NCG", "qr_base": "JOSPO-NEO80NCGWG"},
    {"code": "ROLEX-35-CG-DG", "name": "Jospo Rolex 35 CG DG", "specs": "35L, CG", "qr_base": "JOSPO-ROLEX35CGDG"},
    {"code": "ROLEX-35-CG-WG", "name": "Jospo Rolex 35 CG WG", "specs": "35L, CG", "qr_base": "JOSPO-ROLEX35CGWG"},
    {"code": "ROLEX-35-NCG-DG", "name": "Jospo Rolex 35 NCG DG", "specs": "35L, NCG", "qr_base": "JOSPO-ROLEX35NCGDG"},
    {"code": "ROLEX-35-NCG-WG", "name": "Jospo Rolex 35 NCG WG", "specs": "35L, NCG", "qr_base": "JOSPO-ROLEX35NCGWG"},
    {"code": "ROLEX-65-CG-DG", "name": "Jospo Rolex 65 CG DG", "specs": "65L, CG", "qr_base": "JOSPO-ROLEX65CGDG"},
    {"code": "ROLEX-65-CG-WG", "name": "Jospo Rolex 65 CG WG", "specs": "65L, CG", "qr_base": "JOSPO-ROLEX65CGWG"},
    {"code": "ROLEX-65-NCG-DG", "name": "Jospo Rolex 65 NCG DG", "specs": "65L, DG", "qr_base": "JOSPO-ROLEX65NCGDG"},
    {"code": "ROLEX-65-NCG-WG", "name": "Jopso Rolex 65 NCG WG", "specs": "65L, NCG", "qr_base": "JOSPO-JOPSOROLEX65NCGWG"},
    {"code": "SHINE-100-CG-WG", "name": "Jospo Shine 100 CG WG", "specs": "100L, CG", "qr_base": "JOSPO-SHINE100CGWG"},
    {"code": "SHINE-100-NCG-WG", "name": "Jospo Shine 100 NCG WG", "specs": "100L, NCG", "qr_base": "JOSPO-SHINE100NCGWG"},
    {"code": "SHINE-80-CG-WG", "name": "Jospo Shine 80 CG WG", "specs": "80L, CG", "qr_base": "JOSPO-SHINE80CGWG"},
    {"code": "SHINE-80-NCG-WG", "name": "Jospo Shine 80 NCG WG", "specs": "80L, NCG", "qr_base": "JOSPO-SHINE80NCGWG"},
]

# Fonts
try:
    font_brand = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 26)
    font_sub = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 15)
    font_model_label = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 15)
    font_model = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 38)
    font_model_small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 32)
    font_sn_label = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 15)
    font_sn = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 38)
    font_payload = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 14)
    font_footer = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 13)
except Exception:
    font_brand = font_sub = font_model_label = font_model = font_model_small = font_sn_label = font_sn = font_payload = font_footer = ImageFont.load_default()

def generate_label(model_name, code, serial, qr_payload, specs, out_png_path):
    img = Image.new('RGB', (800, 400), color='#FFFFFF')
    draw = ImageDraw.Draw(img)

    # 1. Border
    draw.rectangle([(5, 5), (794, 394)], outline='#000000', width=3)

    # 2. Header Bar
    draw.rectangle([(5, 5), (794, 52)], fill='#000000')
    draw.text((22, 14), 'JOSPO AIR COOLERS', fill='#FFFFFF', font=font_brand)
    draw.text((630, 20), f'UNIT E-41 | {specs}', fill='#FFFFFF', font=font_sub)

    # 3. QR Code via node
    temp_qr = os.path.join(BASE_DIR, f'temp_qr_{code}.png')
    cmd = f'node -e "require(\'qrcode\').toFile(\'{temp_qr}\', \'{qr_payload}\', {{ width: 320, margin: 1 }});"'
    subprocess.run(cmd, shell=True, check=True)

    qr_img = Image.open(temp_qr).convert('RGB').resize((320, 320))
    img.paste(qr_img, (18, 64))
    if os.path.exists(temp_qr):
        os.remove(temp_qr)

    # 4. Vertical dividing line
    draw.line([(352, 60), (352, 386)], fill='#000000', width=3)

    # 5. MODEL NAME IN BIG AND DARK FONT
    draw.text((372, 68), 'MODEL NAME:', fill='#000000', font=font_model_label)
    f_model = font_model if len(model_name) <= 22 else font_model_small
    draw.text((372, 92), model_name, fill='#000000', font=f_model)

    # Separator
    draw.line([(372, 166), (780, 166)], fill='#000000', width=2)

    # 6. SERIAL NUMBER (BIG AND DARK)
    draw.text((372, 178), 'SERIAL NUMBER:', fill='#000000', font=font_sn_label)
    draw.text((372, 204), f'SN: {serial}', fill='#000000', font=font_sn)

    # Separator
    draw.line([(372, 274), (780, 274)], fill='#CCCCCC', width=2)

    # 7. SCANNABLE DISPATCH CODE
    draw.text((372, 288), 'DISPATCH QR CODE:', fill='#555555', font=font_footer)
    draw.text((372, 310), qr_payload, fill='#000000', font=font_payload)

    # 8. Footer Banner
    draw.rectangle([(372, 346), (780, 384)], fill='#000000')
    draw.text((395, 356), '100% GENUINE FACTORY PACKED - UNIT E-41', fill='#FFFFFF', font=font_footer)

    img.save(out_png_path, quality=95)
    return img

def main():
    print(f'Starting generation for exactly {len(exact_models)} models...')

    # 1. Master CSV
    master_csv_path = os.path.join(OUTPUT_DIR, 'ALL_20_MODELS_MASTER_CATALOG.csv')
    with open(master_csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['MODEL_CODE', 'MODEL_NAME', 'SPECS', 'QR_BASE', 'QR_PREFIX', 'SAMPLE_QR_PAYLOAD', 'SERIAL_NO'])
        for m in exact_models:
            prefix = f"JSP|{m['name']}|"
            sample_payload = f"{prefix}000001"
            writer.writerow([m['code'], m['name'], m['specs'], m['qr_base'], prefix, sample_payload, '#000001'])

    images_for_pdf = []

    # 2. Process each of the 20 models
    for m in exact_models:
        code = m['code']
        name = m['name']
        specs = m['specs']
        qr_prefix = f"JSP|{name}|"
        sample_qr = f"{qr_prefix}000001"

        # A. High-res Label PNG
        out_png = os.path.join(PNG_DIR, f'{code}_100x50mm.png')
        label_img = generate_label(name, code, '000001', sample_qr, specs, out_png)
        images_for_pdf.append(label_img)

        # B. Individual CSV (100 sequential serial numbers)
        indiv_csv_path = os.path.join(INDIV_DIR, f'{code}_100_labels.csv')
        with open(indiv_csv_path, 'w', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            w.writerow(['MODEL_CODE', 'MODEL_NAME', 'SERIAL_NO', 'QR_PAYLOAD', 'SPECS', 'MFG_DATE'])
            for i in range(1, 101):
                sn_str = f'{i:06d}'
                w.writerow([code, name, f'#{sn_str}', f'{qr_prefix}{sn_str}', specs, 'NOV-2026'])

        # C. BTXML Script for BarTender Automation
        btxml_content = f'''<?xml version="1.0" encoding="utf-8"?>
<XMLScript Version="2.0">
  <Command Name="Print_{code}">
    <Print>
      <Format>Jospo_{code}.btw</Format>
      <PrintSetup>
        <Printer>TSC TE244</Printer>
        <NumberSerializedLabels>100</NumberSerializedLabels>
      </PrintSetup>
      <RecordSet Name="{code}_Data" Type="btTextFile">
        <Delimited Delimiter=",">
          <TextDataFile File="individual_models/{code}_100_labels.csv" />
        </Delimited>
      </RecordSet>
      <NamedSubString Name="MODEL_NAME">
        <Value>{name}</Value>
      </NamedSubString>
      <NamedSubString Name="SERIAL_NO">
        <Value>#000001</Value>
      </NamedSubString>
      <NamedSubString Name="QR_PAYLOAD">
        <Value>{sample_qr}</Value>
      </NamedSubString>
    </Print>
  </Command>
</XMLScript>
'''
        btxml_path = os.path.join(BTXML_DIR, f'{code}_print.btxml')
        with open(btxml_path, 'w', encoding='utf-8') as f:
            f.write(btxml_content)

        # D. Direct TSPL script for TSC TE244
        tspl_content = f'''SIZE 100 mm, 50 mm
GAP 3 mm, 0 mm
DIRECTION 1
CLS
BOX 16,16,784,384,4
BAR 16,16,768,48
TEXT 32,28,"3",0,1,1,"JOSPO AIR COOLERS"
TEXT 580,32,"2",0,1,1,"MFG: NOV-2026"
QRCODE 32,80,M,6,A,0,"{sample_qr}"
TEXT 40,345,"2",0,1,1,"SCAN FOR DISPATCH & VERIFY"
BAR 296,80,2,290
TEXT 320,80,"2",0,1,1,"MODEL NAME:"
TEXT 320,105,"4",0,1,1,"{name}"
TEXT 320,165,"2",0,1,1,"SERIAL NUMBER:"
TEXT 320,190,"4",0,1,1,"#000001"
TEXT 320,250,"2",0,1,1,"Specs: {specs} | Unit: E-41"
BAR 320,285,450,1
TEXT 320,300,"1",0,1,1,"QR: {sample_qr}"
BOX 320,335,770,375,1
TEXT 360,345,"2",0,1,1,"100% GENUINE FACTORY PACKED"
PRINT 1
'''
        tspl_path = os.path.join(TSPL_DIR, f'{code}_direct.tspl')
        with open(tspl_path, 'w', encoding='utf-8') as f:
            f.write(tspl_content)

        print(f'✓ Processed {code} ({name})')

    # 3. Save Multi-page PDF
    if images_for_pdf:
        images_for_pdf[0].save(PDF_PATH, save_all=True, append_images=images_for_pdf[1:])
        print(f'✓ Multi-page PDF created at: {PDF_PATH}')
        # Also copy to public/bartender-sample/
        images_for_pdf[0].save(os.path.join(PUBLIC_SAMPLE_DIR, 'ALL_20_MODELS_100x50mm_LABELS.pdf'), save_all=True, append_images=images_for_pdf[1:])

    # 4. Create README setup guide for these 20 models
    readme_content = '''# BarTender Label Printing Guide for the 20 Jospo Cooler Models
**Jospo Air Coolers • Unit E-41 • 100mm × 50mm Thermal Labels**

This package is custom-built for your **exact 20 cooler models**:
1. ICECOOL-55-CG-WG (Jospo Icecool 55 CG WG)
2. ICECOOL-55-NCG-WG (Jospo Icecool 55 NCG WG)
3. ICECOOL-65-CG-WG (Jospo Icecool 65 CG WG)
4. ICECOOL-65-NCG-WG (Jospo Icecool 65 NCG WG)
5. NEO-100-CG-WG (Jospo Neo 100 CG WG)
6. NEO-100-NCG-WG (Jospo Neo 100 NCG WG)
7. NEO-80-CG-WG (Jospo Neo 80 CG WG)
8. NEO-80-NCG-WG (Jospo Neo 80 NCG WG)
9. ROLEX-35-CG-DG (Jospo Rolex 35 CG DG)
10. ROLEX-35-CG-WG (Jospo Rolex 35 CG WG)
11. ROLEX-35-NCG-DG (Jospo Rolex 35 NCG DG)
12. ROLEX-35-NCG-WG (Jospo Rolex 35 NCG WG)
13. ROLEX-65-CG-DG (Jospo Rolex 65 CG DG)
14. ROLEX-65-CG-WG (Jospo Rolex 65 CG WG)
15. ROLEX-65-NCG-DG (Jospo Rolex 65 NCG DG)
16. ROLEX-65-NCG-WG (Jopso Rolex 65 NCG WG)
17. SHINE-100-CG-WG (Jospo Shine 100 CG WG)
18. SHINE-100-NCG-WG (Jospo Shine 100 NCG WG)
19. SHINE-80-CG-WG (Jospo Shine 80 CG WG)
20. SHINE-80-NCG-WG (Jospo Shine 80 NCG WG)

---

## How to Set Up in BarTender Designer (Windows PC)

### Step 1: Create Master Label
1. Open **BarTender Designer** -> Click **File -> New**.
2. Select your printer: **TSC TE244** (or default Windows label printer).
3. Page Setup:
   - Width: `100 mm`
   - Height: `50 mm`
   - Margins: `2 mm`

### Step 2: Connect the Database
1. Go to **File -> Database Connection Setup -> Text File**.
2. Select `ALL_20_MODELS_MASTER_CATALOG.csv`.
3. Finish the wizard. BarTender now knows all 20 models with their codes and specs.

### Step 3: Design the Label (Matching the Standard)
1. **Header**: Add a Text object across the top: `JOSPO AIR COOLERS` (12pt Bold).
2. **Model Name (BIG AND DARK FONT)**:
   - Add Text object -> Set Font to **Arial Bold, 24pt, Dark Black**.
   - Data Source -> **Database Field** -> `MODEL_NAME`.
3. **QR Code**:
   - Add Barcode -> **QR Code** (30mm x 30mm).
   - Data Source -> **Database Field** -> `SAMPLE_QR_PAYLOAD` (or link prefix to `QR_PREFIX` and serial to auto-increment +1).
4. **Serial Number**:
   - Add Text object: `SN: #000001` (Arial Bold, 18pt).
   - Data Source -> Database field `SERIAL_NO` (or auto-incrementing serial).

### Step 4: Save As Master & Individual .btw Files
- Click **File -> Save As -> `Jospo_20_Models_Master.btw`**.
- To have individual .btw desktop shortcuts:
  In BarTender, select a model from the record filter, click **File -> Save As -> `ICECOOL-55-CG-WG.btw`**, etc.

---

## 3 Instant Printing Alternatives (Ready Right Now)
1. **Printable PDF**: Open `EXACT_20_MODELS_100x50mm_LABELS.pdf` in Adobe Acrobat or Chrome and print directly to your TSC TE244.
2. **Direct TSPL Scripts**: Send any file in `tspl_direct_print/` directly to the TSC TE244 printer port via USB / Windows spooler.
3. **BarTender XML Jobs**: Run any file in `btxml_automation/` via BarTender Commander / Integration.
'''
    with open(os.path.join(OUTPUT_DIR, 'README_20_MODELS_SETUP.md'), 'w', encoding='utf-8') as f:
        f.write(readme_content)

    # 5. Build ZIP files
    print('Creating jospo_20_models_bartender_package.zip...')
    with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(OUTPUT_DIR):
            for file in files:
                if not file.startswith('.'):
                    full_p = os.path.join(root, file)
                    rel_p = os.path.relpath(full_p, OUTPUT_DIR)
                    zipf.write(full_p, arcname=rel_p)

    # Also update legacy zip for safety
    import shutil
    shutil.copyfile(ZIP_PATH, LEGACY_ZIP_PATH)
    print(f'✓ ZIP Package created at: {ZIP_PATH}')
    print('Done!')

if __name__ == '__main__':
    main()
