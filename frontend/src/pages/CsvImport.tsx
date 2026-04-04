import { useState, useRef } from 'react';
import { UploadCloud, FileText, ArrowRight, CheckCircle2, AlertTriangle, X, RefreshCw, Download } from 'lucide-react';
import { authFetch } from '../utils/api';

type Step = 'upload' | 'mapping' | 'preview' | 'done';
type ColumnMap = { firstName: string; lastName: string; className: string; tuitionFee: string };
type ImportResult = { createdStudents: number; createdClasses: number };

function parseCSV(text: string): string[][] {
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

export default function CsvImport() {
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>({ firstName: '', lastName: '', className: '', tuitionFee: '' });
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv')) { setError('Veuillez sélectionner un fichier .csv'); return; }
    setFileName(file.name);
    setError('');
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length < 2) { setError('Le fichier est vide ou invalide.'); return; }
      setHeaders(parsed[0]);
      setRows(parsed.slice(1));
      // Auto-detect common column names
      const autoMap = { firstName: '', lastName: '', className: '', tuitionFee: '' };
      parsed[0].forEach(h => {
        const lower = h.toLowerCase();
        if (!autoMap.firstName && (lower.includes('prénom') || lower.includes('prenom') || lower === 'firstname')) autoMap.firstName = h;
        else if (!autoMap.lastName && (lower.includes('nom') || lower === 'lastname')) autoMap.lastName = h;
        else if (!autoMap.className && (lower.includes('classe') || lower === 'class')) autoMap.className = h;
        else if (!autoMap.tuitionFee && (lower.includes('frais') || lower.includes('fee') || lower.includes('tarif'))) autoMap.tuitionFee = h;
      });
      setColumnMap(autoMap);
      setStep('mapping');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const mappedRows = rows.map(row => ({
    firstName: columnMap.firstName ? row[headers.indexOf(columnMap.firstName)] || '' : '',
    lastName: columnMap.lastName ? row[headers.indexOf(columnMap.lastName)] || '' : '',
    className: columnMap.className ? row[headers.indexOf(columnMap.className)] || '' : '',
    tuitionFee: columnMap.tuitionFee ? parseFloat(row[headers.indexOf(columnMap.tuitionFee)]) || 0 : undefined,
  })).filter(r => r.firstName || r.lastName);

  const handleImport = async () => {
    setImporting(true); setError('');
    try {
      const res = await authFetch('/api/import/students', {
        method: 'POST',
        body: JSON.stringify({ rows: mappedRows })
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setResult(data);
      setStep('done');
    } finally { setImporting(false); }
  };

  const downloadSample = () => {
    const content = [
      'Prénom,Nom,Classe,Frais',
      'Jean,Dupont,6ème A,150',
      'Marie,Martin,6ème A,150',
      'Paul,Leblanc,6ème B,150',
      'Sophie,Bernard,6ème B,150',
      'Lucas,Moreau,5ème A,180',
      'Emma,Petit,5ème A,180',
      'Hugo,Laurent,5ème B,180',
      'Camille,Simon,4ème A,200',
      'Nathan,Michel,4ème A,200',
      'Léa,Lefebvre,3ème A,220',
    ].join('\n');
    const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eleves_exemple.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep('upload'); setHeaders([]); setRows([]); setFileName('');
    setColumnMap({ firstName: '', lastName: '', className: '', tuitionFee: '' });
    setResult(null); setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const STEPS = [
    { id: 'upload',  label: 'Fichier' },
    { id: 'mapping', label: 'Colonnes' },
    { id: 'preview', label: 'Aperçu' },
    { id: 'done',    label: 'Résultat' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Import CSV</h2>
        <p className="mt-2 text-sm text-slate-500">Importez des élèves et leurs classes depuis un fichier CSV.</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const stepOrder = ['upload', 'mapping', 'preview', 'done'];
          const currentIdx = stepOrder.indexOf(step);
          const isActive = s.id === step;
          const isDone = stepOrder.indexOf(s.id) < currentIdx;
          return (
            <div key={s.id} className="flex items-center flex-1 last:flex-none">
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                isActive ? 'bg-primary text-white shadow-sm' :
                isDone ? 'bg-emerald-50 text-emerald-700' :
                'bg-slate-100 text-slate-400'
              }`}>
                {isDone ? <CheckCircle2 className="w-4 h-4"/> : <span className="w-4 h-4 flex items-center justify-center text-xs font-black">{i+1}</span>}
                {s.label}
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${isDone ? 'bg-emerald-200' : 'bg-slate-100'}`}/>}
            </div>
          );
        })}
      </div>

      {/* STEP 1: Upload */}
      {step === 'upload' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
          <div
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
              dragOver ? 'border-primary bg-blue-50' : 'border-slate-200 hover:border-primary/50 hover:bg-slate-50'
            }`}
          >
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            <UploadCloud className={`w-14 h-14 mx-auto mb-4 transition-colors ${dragOver ? 'text-primary' : 'text-slate-300'}`} />
            <p className="text-lg font-semibold text-slate-700">Glissez votre fichier CSV ici</p>
            <p className="text-sm text-slate-400 mt-1">ou cliquez pour parcourir</p>
            <p className="text-xs text-slate-300 mt-4">Format attendu : colonnes séparées par des virgules, première ligne = en-têtes</p>
          </div>
          {error && <p className="mt-4 text-sm text-red-600 bg-red-50 px-4 py-2 rounded-lg flex items-center gap-2"><AlertTriangle className="w-4 h-4"/>{error}</p>}
          {/* Example + Download */}
          <div className="mt-6 p-4 bg-slate-50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-2">Exemple de fichier</p>
              <code className="text-xs text-slate-600 font-mono">
                Prénom,Nom,Classe,Frais<br/>
                Jean,Dupont,6ème A,150<br/>
                Marie,Martin,6ème B,150
              </code>
            </div>
            <button
              onClick={downloadSample}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-all shadow-sm whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-primary" />
              Télécharger un fichier test
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Column mapping */}
      {step === 'mapping' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-6">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary"/>
            <div>
              <p className="font-semibold text-slate-800">{fileName}</p>
              <p className="text-xs text-slate-400">{rows.length} ligne{rows.length > 1 ? 's' : ''} détectée{rows.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <p className="text-sm text-slate-600">Associez chaque champ aux colonnes de votre fichier CSV.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {([
              { key: 'firstName', label: 'Prénom', required: true },
              { key: 'lastName',  label: 'Nom',    required: true },
              { key: 'className', label: 'Classe',  required: false },
              { key: 'tuitionFee', label: 'Frais de scolarité (optionnel)', required: false },
            ] as const).map(field => (
              <div key={field.key}>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
                <select
                  value={columnMap[field.key]}
                  onChange={e => setColumnMap(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-primary"
                >
                  <option value="">-- Aucune colonne --</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          {(!columnMap.firstName || !columnMap.lastName) && (
            <p className="text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4"/> Prénom et Nom sont obligatoires.
            </p>
          )}
          <div className="flex justify-between pt-2">
            <button onClick={reset} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4"/> Annuler
            </button>
            <button
              onClick={() => setStep('preview')}
              disabled={!columnMap.firstName || !columnMap.lastName}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-blue-600 transition-all disabled:opacity-40"
            >
              Aperçu <ArrowRight className="w-4 h-4"/>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Preview */}
      {step === 'preview' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <p className="font-bold text-slate-800">{mappedRows.length} élève{mappedRows.length > 1 ? 's' : ''} à importer</p>
              <button onClick={() => setStep('mapping')} className="text-sm text-primary font-medium hover:text-blue-700">Modifier le mapping</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-white sticky top-0">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">#</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Prénom</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Nom</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Classe</th>
                    {columnMap.tuitionFee && <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Frais</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mappedRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">{row.firstName || <span className="text-red-400 italic">manquant</span>}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">{row.lastName || <span className="text-red-400 italic">manquant</span>}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">{row.className || <span className="text-slate-300 italic">—</span>}</td>
                      {columnMap.tuitionFee && <td className="px-5 py-3 text-sm text-emerald-600 font-semibold">{row.tuitionFee ?? '—'} €</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl flex items-center gap-2"><AlertTriangle className="w-4 h-4"/>{error}</p>}
          <div className="flex justify-between">
            <button onClick={() => setStep('mapping')} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Retour</button>
            <button
              onClick={handleImport}
              disabled={importing || mappedRows.length === 0}
              className="flex items-center gap-2 px-7 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-blue-600 transition-all shadow-sm shadow-primary/20 disabled:opacity-60"
            >
              {importing ? <><RefreshCw className="w-4 h-4 animate-spin"/> Import en cours...</> : `Importer ${mappedRows.length} élève${mappedRows.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Done */}
      {step === 'done' && result && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-emerald-500"/>
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-800">Import réussi !</h3>
            <p className="text-slate-500 mt-2 text-sm">Les données ont été ajoutées à la base.</p>
          </div>
          <div className="flex justify-center gap-6">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-8 py-5">
              <p className="text-3xl font-black text-primary">{result.createdStudents}</p>
              <p className="text-sm text-slate-600 mt-1">élève{result.createdStudents > 1 ? 's' : ''} créé{result.createdStudents > 1 ? 's' : ''}</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-8 py-5">
              <p className="text-3xl font-black text-indigo-600">{result.createdClasses}</p>
              <p className="text-sm text-slate-600 mt-1">classe{result.createdClasses > 1 ? 's' : ''} créée{result.createdClasses > 1 ? 's' : ''}</p>
            </div>
          </div>
          <button
            onClick={reset}
            className="mx-auto flex items-center gap-2 px-6 py-2.5 bg-slate-100 text-slate-700 font-semibold text-sm rounded-xl hover:bg-slate-200 transition-colors"
          >
            <UploadCloud className="w-4 h-4"/> Nouvel import
          </button>
        </div>
      )}
    </div>
  );
}
