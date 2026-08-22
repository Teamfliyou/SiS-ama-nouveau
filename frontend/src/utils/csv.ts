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
