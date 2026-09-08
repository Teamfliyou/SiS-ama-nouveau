// Minimal CSV parsing helpers shared by the import pages.

export function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map(line => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else { current += char; }
    }
    result.push(current.trim());
    return result;
  });
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Generates a real Excel file (SpreadsheetML 2003, .xls) from a CSV string.
// No external dependency required, opens in Excel, LibreOffice and Google Sheets.
export function downloadExcel(filename: string, csvContent: string) {
  const rows = parseCSV(csvContent);
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const body = rows
    .map((row, i) => {
      const style = i === 0 ? ' ss:StyleID="hdr"' : '';
      const cells = row.map(c => `<Cell${style}><Data ss:Type="String">${esc(c)}</Data></Cell>`).join('');
      return `    <Row>${cells}</Row>`;
    })
    .join('\n');
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n` +
    ` xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n` +
    `  <Styles>\n` +
    `    <Style ss:ID="hdr"><Font ss:Bold="1" ss:Color="#1F2937"/><Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/></Style>\n` +
    `  </Styles>\n` +
    `  <Worksheet ss:Name="Import">\n` +
    `    <Table>\n` +
    body + '\n' +
    `    </Table>\n` +
    `  </Worksheet>\n` +
    `</Workbook>\n`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Find the first header matching any of the given aliases (exact match first, then partial).
export function findColumn(headers: string[], aliases: string[]): string {
  const lower = headers.map(h => h.toLowerCase());
  for (const alias of aliases) {
    const a = alias.toLowerCase();
    const exact = lower.indexOf(a);
    if (exact !== -1) return headers[exact];
  }
  for (const alias of aliases) {
    const a = alias.toLowerCase();
    const partial = lower.findIndex(h => h.includes(a));
    if (partial !== -1) return headers[partial];
  }
  return '';
}
