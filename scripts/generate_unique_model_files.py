import os
import csv
import subprocess
import zipfile
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ROOT_OUTPUT_DIR = os.path.join(BASE_DIR, 'bartender_20_models')
UNIQUE_DIR = os.path.join(ROOT_OUTPUT_DIR, 'unique_model_files')
ZIP_PATH = os.path.join(BASE_DIR, 'public', 'jospo_20_models_bartender_package.zip')

os.makedirs(UNIQUE_DIR, exist_ok=True)

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

def render_label_img(model_name, code, serial, qr_payload, specs):
    img = Image.new('RGB', (800, 400), color='#FFFFFF')
    draw = ImageDraw.Draw(img)

    # Border
    draw.rectangle([(5, 5), (794, 394)], outline='#000000', width=3)

    # Header Bar
    draw.rectangle([(5, 5), (794, 52)], fill='#000000')
    draw.text((22, 14), 'JOSPO AIR COOLERS', fill='#FFFFFF', font=font_brand)
    draw.text((630, 20), f'UNIT E-41 | {specs}', fill='#FFFFFF', font=font_sub)

    # QR Code
    temp_qr = os.path.join(BASE_DIR, f'temp_{code}_{serial}.png')
    cmd = f'node -e "require(\'qrcode\').toFile(\'{temp_qr}\', \'{qr_payload}\', {{ width: 320, margin: 1 }});"'
    subprocess.run(cmd, shell=True, check=True)

    qr_img = Image.open(temp_qr).convert('RGB').resize((320, 320))
    img.paste(qr_img, (18, 64))
    if os.path.exists(temp_qr):
        os.remove(temp_qr)

    # Divider
    draw.line([(352, 60), (352, 386)], fill='#000000', width=3)

    # Model Name (Big & Dark)
    draw.text((372, 68), 'MODEL NAME:', fill='#000000', font=font_model_label)
    f_model = font_model if len(model_name) <= 22 else font_model_small
    draw.text((372, 92), model_name, fill='#000000', font=f_model)

    draw.line([(372, 166), (780, 166)], fill='#000000', width=2)

    # Serial Number (Big & Dark)
    draw.text((372, 178), 'SERIAL NUMBER:', fill='#000000', font=font_sn_label)
    draw.text((372, 204), f'SN: {serial}', fill='#000000', font=font_sn)

    draw.line([(372, 274), (780, 274)], fill='#CCCCCC', width=2)

    # QR Payload
    draw.text((372, 288), 'DISPATCH QR CODE:', fill='#555555', font=font_footer)
    draw.text((372, 310), qr_payload, fill='#000000', font=font_payload)

    # Footer
    draw.rectangle([(372, 346), (780, 384)], fill='#000000')
    draw.text((395, 356), '100% GENUINE FACTORY PACKED - UNIT E-41', fill='#FFFFFF', font=font_footer)

    return img

def main():
    print(f'Generating dedicated unique folders for all {len(exact_models)} models...')

    for m in exact_models:
        code = m['code']
        name = m['name']
        specs = m['specs']
        qr_prefix = f"JSP|{name}|"

        model_dir = os.path.join(UNIQUE_DIR, code)
        os.makedirs(model_dir, exist_ok=True)

        # 1. Dedicated CSV Database (100 sequential serial numbers for this model only)
        csv_path = os.path.join(model_dir, f'{code}_database.csv')
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            w = csv.writer(f)
            w.writerow(['MODEL_CODE', 'MODEL_NAME', 'SERIAL_NO', 'QR_PAYLOAD', 'SPECS', 'MFG_DATE'])
            for i in range(1, 101):
                sn = f'{i:06d}'
                w.writerow([code, name, f'#{sn}', f'{qr_prefix}{sn}', specs, 'NOV-2026'])

        # 2. Dedicated High-Res PNG Graphic (100mm x 50mm)
        png_path = os.path.join(model_dir, f'{code}_label_preview.png')
        img_label = render_label_img(name, code, '000001', f'{qr_prefix}000001', specs)
        img_label.save(png_path, quality=95)

        # 3. Dedicated Multi-Label Printable PDF (Pages 000001 - 000010 for this model)
        pdf_path = os.path.join(model_dir, f'{code}_printable_labels.pdf')
        pdf_pages = [img_label]
        for i in range(2, 11):
            sn = f'{i:06d}'
            page_img = render_label_img(name, code, sn, f'{qr_prefix}{sn}', specs)
            pdf_pages.append(page_img)
        pdf_pages[0].save(pdf_path, save_all=True, append_images=pdf_pages[1:])

        # 4. Dedicated BarTender XML Print Script
        btxml_path = os.path.join(model_dir, f'{code}_print_job.btxml')
        btxml_content = f'''<?xml version="1.0" encoding="utf-8"?>
<XMLScript Version="2.0">
  <Command Name="Print_{code}">
    <Print>
      <Format>{code}.btw</Format>
      <PrintSetup>
        <Printer>TSC TE244</Printer>
        <NumberSerializedLabels>100</NumberSerializedLabels>
      </PrintSetup>
      <RecordSet Name="{code}_Records" Type="btTextFile">
        <Delimited Delimiter=",">
          <TextDataFile File="{code}_database.csv" />
        </Delimited>
      </RecordSet>
      <NamedSubString Name="MODEL_NAME">
        <Value>{name}</Value>
      </NamedSubString>
      <NamedSubString Name="SERIAL_NO">
        <Value>#000001</Value>
      </NamedSubString>
      <NamedSubString Name="QR_PAYLOAD">
        <Value>{qr_prefix}000001</Value>
      </NamedSubString>
    </Print>
  </Command>
</XMLScript>
'''
        with open(btxml_path, 'w', encoding='utf-8') as f:
            f.write(btxml_content)

        # 5. Dedicated TSPL Direct Hardware Script for TSC TE244
        tspl_path = os.path.join(model_dir, f'{code}_direct_hardware.tspl')
        tspl_content = f'''SIZE 100 mm, 50 mm
GAP 3 mm, 0 mm
DIRECTION 1
CLS
BOX 16,16,784,384,4
BAR 16,16,768,48
TEXT 32,28,"3",0,1,1,"JOSPO AIR COOLERS"
TEXT 580,32,"2",0,1,1,"MFG: NOV-2026"
QRCODE 32,80,M,6,A,0,"{qr_prefix}000001"
TEXT 40,345,"2",0,1,1,"SCAN FOR DISPATCH & VERIFY"
BAR 296,80,2,290
TEXT 320,80,"2",0,1,1,"MODEL NAME:"
TEXT 320,105,"4",0,1,1,"{name}"
TEXT 320,165,"2",0,1,1,"SERIAL NUMBER:"
TEXT 320,190,"4",0,1,1,"#000001"
TEXT 320,250,"2",0,1,1,"Specs: {specs} | Unit: E-41"
BAR 320,285,450,1
TEXT 320,300,"1",0,1,1,"QR: {qr_prefix}000001"
BOX 320,335,770,375,1
TEXT 360,345,"2",0,1,1,"100% GENUINE FACTORY PACKED"
PRINT 1
'''
        with open(tspl_path, 'w', encoding='utf-8') as f:
            f.write(tspl_content)

        # 6. Dedicated 1-Click Windows Print Batch Script
        bat_path = os.path.join(model_dir, f'PRINT_{code}.bat')
        bat_content = f'''@echo off
echo ========================================================
echo JOSPO AIR COOLERS - PRINTING LABELS: {name}
echo ========================================================
echo Model: {name} ({code})
echo Labels: 100 Serialized Labels (000001 to 000100)
echo.
echo Option 1: Double-click "{code}_printable_labels.pdf" to print directly to TSC TE244.
echo Option 2: Open BarTender and link "{code}_database.csv".
echo ========================================================
pause
'''
        with open(bat_path, 'w', encoding='utf-8') as f:
            f.write(bat_content)

        print(f'✓ Created unique folder: unique_model_files/{code}/')

    # Update Package ZIP
    print('Updating jospo_20_models_bartender_package.zip...')
    with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(ROOT_OUTPUT_DIR):
            for file in files:
                if not file.startswith('.'):
                    full_p = os.path.join(root, file)
                    rel_p = os.path.relpath(full_p, ROOT_OUTPUT_DIR)
                    zipf.write(full_p, arcname=rel_p)

    print(f'✓ Complete ZIP updated at: {ZIP_PATH}')
    print('All 20 unique model folders generated successfully!')

if __name__ == '__main__':
    main()
