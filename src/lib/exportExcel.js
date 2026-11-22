/**
 * Export data array to an Excel (.xlsx) file with styled column widths.
 * Dynamically imports xlsx on-demand to save ~350KB from initial bundle.
 *
 * @param {Array<Object>} data - Array of row objects to export
 * @param {string} fileName - Base name of the file (e.g. 'Jospo_Dispatches_2026-11-18')
 * @param {string} [sheetName='Report'] - Name of the worksheet
 */
export async function exportToExcel(data, fileName, sheetName = 'Report') {
  if (!data || !data.length) return;

  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(data);

  // Auto-calculate column widths
  const keys = Object.keys(data[0] || {});
  const colWidths = keys.map((key) => {
    let maxLen = key.length;
    data.forEach((row) => {
      const val = row[key];
      if (val !== null && val !== undefined) {
        const str = String(val);
        if (str.length > maxLen) maxLen = str.length;
      }
    });
    return { wch: Math.min(Math.max(maxLen + 3, 10), 50) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
