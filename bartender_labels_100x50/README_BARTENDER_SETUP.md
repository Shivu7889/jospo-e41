# BarTender 100mm × 50mm Label Printing Guide (TSC TE244)
**Jospo Air Coolers Manufacturing & Dispatch System**

This folder contains all the files, databases, and visual templates to print **100mm × 50mm** serial QR labels for all 25 Jospo cooler models using your **TSC TE244** printer.

---

## Folder Contents

* **`ALL_MODELS_MASTER_CATALOG.csv`**: Master database containing all 25 Jospo cooler models (Model Name, Code, Series, Tank, Fan, Power, and QR prefix).
* **`individual_models/`**: 25 separate CSV spreadsheets (one for each model) with 100 pre-configured sequential serial numbers (`000001` to `000100`).
* **`sample_labels_png/`**: 25 high-resolution (800 × 400 px, 203 DPI) ready-to-print label graphics for every single model.
* **`ALL_MODELS_100x50mm_LABELS.pdf`**: Multi-page PDF document containing all 25 model labels (100mm × 50mm) that can be opened in Adobe Acrobat or browser and printed directly to the TSC TE244!
* **`bartender_print_job.btxml`**: Standard BarTender XML Print Script for BarTender Automation.
* **`SAMPLE_DIRECT_PRINT_TSC_TE244.tspl`**: Direct TSPL command script for the TSC TE244 printer.

---

## 2-Minute BarTender Setup (for TSC TE244)

Follow these steps once on your Windows PC connected to the TSC TE244 to create your master template:

### Step 1: Label Page Setup
1. Open **BarTender** $\rightarrow$ Click **File** $\rightarrow$ **New**.
2. Select your printer: **TSC TE244** (using Seagull Scientific driver).
3. On Page Setup:
   * **Label Width**: `100.0 mm`
   * **Label Height**: `50.0 mm`
   * **Orientation**: Portrait / Normal
   * **Margins**: Left `2mm`, Right `2mm`, Top `2mm`, Bottom `2mm`
   * **Sensor**: Gap / Transmissive (`3.0 mm` gap between labels).

### Step 2: Connect the Database (Pick Any Model with 1 Click)
1. In BarTender, go to **File** $\rightarrow$ **Database Connection Setup**.
2. Select **Text File** $\rightarrow$ Browse to `ALL_MODELS_MASTER_CATALOG.csv` in this folder.
3. Finish the wizard. BarTender now knows all 25 models!

### Step 3: Design the 100mm × 50mm Layout
1. **Brand Header**:
   * Add a Text object across the top: `JOSPO AIR COOLERS` (Font: Arial / Helvetica Bold, 12pt).
2. **QR Code**:
   * Click **Create Barcode** $\rightarrow$ **QR Code** $\rightarrow$ Place it on the left side (approx 30mm × 30mm).
   * Double-click QR code $\rightarrow$ **Properties**:
     * Data Source 1: Set Type to **Database Field** $\rightarrow$ Select `QR_PREFIX` (e.g. `JSP|Rolex 35 CG WG|`).
     * Data Source 2 (Sub-string): Click **New Data Source** $\rightarrow$ Type: `Embedded Data`, initial value: `000001`.
     * On the right panel, go to **Transforms** $\rightarrow$ **Serialization** $\rightarrow$ Check **Increment** (By: 1).
3. **Model Name**:
   * Add a Text object $\rightarrow$ Set Data Source to **Database Field** $\rightarrow$ Select `MODEL_NAME` (Font: Bold, 16pt).
4. **Serial Number Text**:
   * Add a Text object below model name: `SR: #000001` (link the serial number to the same serialized data source so text and QR match).
5. **Specs & Warranty Badge**:
   * Add text for Tank & Fan capacity from database fields.
   * Add footer: `100% GENUINE FACTORY PACKED`.

### Step 4: Save & Print!
* Save as `Jospo_100x50mm_Master.btw`.
* Whenever printing:
  1. Click **Print**.
  2. Select the cooler model (e.g., `Rolex 35 CG WG`).
  3. Enter Quantity (e.g. `50`).
  4. The TSC TE244 will print 50 stickers numbered `#000001` to `#000050`!
