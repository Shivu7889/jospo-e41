import os
import csv
import subprocess
from PIL import Image, ImageDraw, ImageFont
import zipfile

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
CATALOG_PATH = os.path.join(BASE_DIR, 'bartender_labels_100x50', 'ALL_MODELS_MASTER_CATALOG.csv')
PNG_DIR = os.path.join(BASE_DIR, 'bartender_labels_100x50', 'sample_labels_png')
QR_DIR = os.path.join(BASE_DIR, 'bartender_labels_100x50', 'qr_codes')
PUBLIC_SAMPLE_DIR = os.path.join(BASE_DIR, 'public', 'bartender-sample')
PDF_PATH = os.path.join(BASE_DIR, 'bartender_labels_100x50', 'ALL_MODELS_100x50mm_LABELS.pdf')
ZIP_PATH = os.path.join(BASE_DIR, 'public', 'jospo_bartender_100x50mm_package.zip')

os.makedirs(PNG_DIR, exist_ok=True)
os.makedirs(QR_DIR, exist_ok=True)
os.makedirs(PUBLIC_SAMPLE_DIR, exist_ok=True)

# Try fonts
try:
    font_brand = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 26)
    font_sub = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 15)
    font_model_label = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 16)
    font_model = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 42)
    font_model_small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 34)
    font_sn_label = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 16)
    font_sn = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 38)
    font_payload = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 15)
    font_footer = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 13)
except Exception as e:
    print('Falling back to default font:', e)
    font_brand = font_sub = font_model_label = font_model = font_model_small = font_sn_label = font_sn = font_payload = font_footer = ImageFont.load_default()

def generate_label(model_name, serial, qr_payload, out_png_path):
    # 800 x 400 px = 100mm x 50mm at 203 DPI standard label printer
    img = Image.new('RGB', (800, 400), color='#FFFFFF')
    draw = ImageDraw.Draw(img)

    # 1. Outer Border
    draw.rectangle([(5, 5), (794, 394)], outline='#000000', width=3)

    # 2. Header Bar
    draw.rectangle([(5, 5), (794, 52)], fill='#000000')
    draw.text((22, 14), 'JOSPO AIR COOLERS', fill='#FFFFFF', font=font_brand)
    draw.text((640, 20), 'UNIT E-41', fill='#FFFFFF', font=font_sub)

    # 3. Generate QR code using node qrcode
    temp_qr = os.path.join(BASE_DIR, f'temp_qr_{os.getpid()}.png')
    cmd = f'node -e "require(\'qrcode\').toFile(\'{temp_qr}\', \'{qr_payload}\', {{ width: 320, margin: 1 }});"'
    subprocess.run(cmd, shell=True, check=True)

    qr_img = Image.open(temp_qr).convert('RGB').resize((320, 320))
    img.paste(qr_img, (18, 64))
    if os.path.exists(temp_qr):
        os.remove(temp_qr)

    # 4. Vertical dividing line
    draw.line([(352, 60), (352, 386)], fill='#000000', width=3)

    # 5. MODEL NAME (BIG AND DARK FONT)
    draw.text((372, 68), 'MODEL NAME:', fill='#000000', font=font_model_label)
    
    # Adjust font size if model name is very long
    f_model = font_model if len(model_name) <= 15 else font_model_small
    draw.text((372, 92), model_name, fill='#000000', font=f_model)

    # Separator
    draw.line([(372, 168), (780, 168)], fill='#000000', width=2)

    # 6. SERIAL NUMBER (PROMINENT AND DARK)
    draw.text((372, 180), 'SERIAL NUMBER:', fill='#000000', font=font_sn_label)
    draw.text((372, 206), f'SN: {serial}', fill='#000000', font=font_sn)

    # Separator
    draw.line([(372, 276), (780, 276)], fill='#CCCCCC', width=2)

    # 7. SCANNABLE DISPATCH CODE
    draw.text((372, 292), 'DISPATCH QR CODE:', fill='#555555', font=font_footer)
    draw.text((372, 314), qr_payload, fill='#000000', font=font_payload)

    # 8. Footer Banner
    draw.rectangle([(372, 348), (780, 384)], fill='#000000')
    draw.text((400, 356), '100% GENUINE FACTORY PACKED - UNIT E-41', fill='#FFFFFF', font=font_footer)

    img.save(out_png_path, quality=95)
    return img

def main():
    print('Generating high-res labels with BIG & DARK font...')
    images_for_pdf = []

    # Read Catalog
    with open(CATALOG_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        models = list(reader)

    print(f'Found {len(models)} models in catalog.')

    for row in models:
        m_name = row['MODEL_NAME'].strip()
        m_code = row['MODEL_CODE'].strip()
        qr_prefix = row['QR_PREFIX'].strip()
        serial = '000001'
        qr_payload = f'{qr_prefix}{serial}'

        safe_name = m_name.replace(' ', '_').replace('/', '_')
        out_png = os.path.join(PNG_DIR, f'{safe_name}_100x50mm.png')

        label_img = generate_label(m_name, serial, qr_payload, out_png)
        images_for_pdf.append(label_img)
        print(f'✓ Generated: {out_png}')

        # Also copy sample of Rolex 35, Defender 110, Maxx 125, IceCool 65 to public/bartender-sample
        if safe_name in ['Rolex_35_CG_WG', 'Defender_110', 'Maxx_125', 'IceCool_65', 'Neo_100']:
            pub_path = os.path.join(PUBLIC_SAMPLE_DIR, f'LABEL_{safe_name}.png')
            label_img.save(pub_path)
            print(f'  -> Copied to {pub_path}')

    # Save Multi-page PDF
    if images_for_pdf:
        first = images_for_pdf[0]
        rest = images_for_pdf[1:]
        first.save(PDF_PATH, save_all=True, append_images=rest)
        print(f'✓ Multi-page printable PDF generated at: {PDF_PATH}')

    # Update ZIP file
    print('Updating ZIP package...')
    with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Add master catalog
        zipf.write(CATALOG_PATH, arcname='ALL_MODELS_MASTER_CATALOG.csv')
        zipf.write(PDF_PATH, arcname='ALL_MODELS_100x50mm_LABELS.pdf')
        
        # Add sample PNGs
        for fname in os.listdir(PNG_DIR):
            if fname.endswith('.png'):
                zipf.write(os.path.join(PNG_DIR, fname), arcname=f'sample_labels_png/{fname}')

        # Add README
        readme_path = os.path.join(BASE_DIR, 'bartender_labels_100x50', 'README_BARTENDER_SETUP.md')
        if os.path.exists(readme_path):
            zipf.write(readme_path, arcname='README_BARTENDER_SETUP.md')

    print(f'✓ Package ZIP updated at: {ZIP_PATH}')

if __name__ == '__main__':
    main()
