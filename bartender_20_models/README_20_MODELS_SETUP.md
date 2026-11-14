# BarTender Label Printing Guide for the 20 Jospo Cooler Models
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
