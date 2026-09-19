import { useState, useRef } from 'react';
import { UploadCloud, FileText, ArrowRight, CheckCircle2, AlertTriangle, X, RefreshCw, Download } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { formatCurrency } from '../utils/format';
import { parseCSV, downloadCsv, downloadExcel, findColumn } from '../utils/csv';

type Step = 'upload' | 'mapping' | 'preview' | 'done';

type ColumnMap = {
  firstName: string;
  lastName: string;
  className: string;
  tuitionFee: string;
  phone: string;
  familyRef: string;
  familySize: string;
  parentEmail: string;
  wasEnrolled2025_2026: string;
  arabicCourse: string;
  quranCourse: string;
  dateOfBirth: string;
  ageInOctober2026: string;
  parentName: string;
  parentAddress: string;
};

type ImportResult = {
  createdStudents: number;
  updatedStudents?: number;
  createdClasses: number;
  createdFamilies?: number;
  linkedFamilies?: number;
  skipped?: number;
  errors?: { row: number; reason: string }[];
};

const EMPTY_COLUMN_MAP: ColumnMap = {
  firstName: '',
  lastName: '',
  className: '',
  tuitionFee: '',
  phone: '',
  familyRef: '',
  familySize: '',
  parentEmail: '',
  wasEnrolled2025_2026: '',
  arabicCourse: '',
  quranCourse: '',
  dateOfBirth: '',
  ageInOctober2026: '',
  parentName: '',
  parentAddress: '',
};

const cell = (row: string[], headers: string[], header: string): string =>
  header ? row[headers.indexOf(header)]?.trim() || '' : '';

const parseOptionalNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const n = Number(value.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

const parseOptionalInteger = (value: string): number | null => {
  if (!value.trim()) return null;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) ? n : null;
};

const parseEnrollmentAnswer = (value: string): boolean | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'oui' || normalized === 'yes' || normalized === 'true' || normalized === '1') return true;
  if (normalized.startsWith('non') || normalized === 'no' || normalized === 'false' || normalized === '0') return false;
  return null;
};

export default function CsvImport({ embedded = false }: { embedded?: boolean } = {}) {
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<ColumnMap>(EMPTY_COLUMN_MAP);
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
      // Détection automatique des colonnes du formulaire AMA 2026-2027.
      const autoMap: ColumnMap = {
        firstName: findColumn(parsed[0], ['Prénom', 'Prenom', 'firstname']),
        lastName: findColumn(parsed[0], ['Nom', 'lastname']),
        className: findColumn(parsed[0], ['Classe', 'class']),
        tuitionFee: findColumn(parsed[0], ['Frais', 'Tarif', 'Prix', 'fee']),
        phone: findColumn(parsed[0], ['Téléphone', 'Telephone', 'phone', 'portable', 'contact']),
        familyRef: findColumn(parsed[0], ['ID Famille', 'Identifiant famille', 'Family ID']),
        familySize: findColumn(parsed[0], ['Nb élèves famille', 'Nb eleves famille', 'Nombre élèves famille']),
        parentEmail: findColumn(parsed[0], ['Adresse e-mail', 'Adresse email', 'Email parent', 'E-mail parent']),
        wasEnrolled2025_2026: findColumn(parsed[0], [
          'Votre enfant était inscrit en 2025-2026 ?',
          'Inscrit en 2025-2026',
          '2025-2026',
        ]),
        arabicCourse: findColumn(parsed[0], ['ARABE']),
        quranCourse: findColumn(parsed[0], ['CORAN']),
        dateOfBirth: findColumn(parsed[0], ['Date de naissance', 'Date naissance', 'Naissance']),
        ageInOctober2026: findColumn(parsed[0], ['Age en Octobre 2026', 'Âge en Octobre 2026']),
        parentName: findColumn(parsed[0], ['NOM & Prénom', 'Nom & Prénom', 'Nom parent', 'Parent']),
        parentAddress: findColumn(parsed[0], ['Adresse parent', 'Adresse']),
      };
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

  const mappedRows = rows.map(row => {
    const feeRaw = cell(row, headers, columnMap.tuitionFee);
    const familySizeRaw = cell(row, headers, columnMap.familySize);
    const ageRaw = cell(row, headers, columnMap.ageInOctober2026);

    return {
      firstName: cell(row, headers, columnMap.firstName),
      lastName: cell(row, headers, columnMap.lastName),
      className: cell(row, headers, columnMap.className) || null,
      tuitionFee: feeRaw ? parseOptionalNumber(feeRaw) : undefined,
      phone: cell(row, headers, columnMap.phone) || null,
      familyRef: cell(row, headers, columnMap.familyRef) || null,
      familySize: familySizeRaw ? parseOptionalInteger(familySizeRaw) : null,
      parentEmail: cell(row, headers, columnMap.parentEmail) || null,
      wasEnrolled2025_2026: parseEnrollmentAnswer(cell(row, headers, columnMap.wasEnrolled2025_2026)),
      arabicCourse: cell(row, headers, columnMap.arabicCourse) || null,
      quranCourse: cell(row, headers, columnMap.quranCourse) || null,
      dateOfBirth: cell(row, headers, columnMap.dateOfBirth) || null,
      ageInOctober2026: ageRaw ? parseOptionalInteger(ageRaw) : null,
      parentName: cell(row, headers, columnMap.parentName) || null,
      parentAddress: cell(row, headers, columnMap.parentAddress) || null,
    };
  }).filter(r => r.firstName || r.lastName);

  const handleImport = async () => {
    setImporting(true); setError('');
    try {
      const res = await authFetch('/api/import-csv/students', {
        method: 'POST',
        body: JSON.stringify({ rows: mappedRows })
      });
      const data = await safeJson<ImportResult>(res);
      setResult(data);
      setStep('done');
    } catch (err) {
      setError(apiErrorMessage(err));
      setStep('preview');
    } finally { setImporting(false); }
  };

  const sampleContent = () => [
    'Prénom,Nom,Classe,Frais,Téléphone,ID Famille,Nb élèves famille,Adresse e-mail,Votre enfant était inscrit en 2025-2026 ?,ARABE,CORAN,Date de naissance,Age en Octobre 2026,NOM & Prénom',
    'Naël,Philippe,Ateliers 4 ans,130,07 73 81 22 80,FAM001,1,parent@example.com,"Non, c\'est une nouvelle inscription",Ateliers 4 ans,,2022-06-11,4,Parent Exemple',
  ].join('\n');

  const downloadSample = () => {
    downloadCsv('eleves_exemple_complet.csv', sampleContent());
  };

  const downloadSampleExcel = () => {
    downloadExcel('eleves_exemple_complet.xls', sampleContent());
  };

  const reset = () => {
    setStep('upload'); setHeaders([]); setRows([]); setFileName('');
    setColumnMap(EMPTY_COLUMN_MAP);
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
      {!embedded && (
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Import CSV</h2>
          <p className="mt-2 text-sm text-slate-500">Importez les élèves, classes, familles et toutes les informations du formulaire d’inscription.</p>
        </div>
      )}

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
                Prénom,Nom,Classe,Frais,Téléphone,ID Famille…<br/>
                Naël,Philippe,Ateliers 4 ans,130,07…,FAM001…
              </code>
            </div>
            <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadSample}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-all shadow-sm whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-primary" />
              Télécharger un fichier test
            </button>
            <button
              onClick={downloadSampleExcel}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-semibold text-emerald-700 hover:bg-emerald-100 transition-all shadow-sm whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              Télécharger en Excel
            </button>
          </div>
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
              { key: 'lastName', label: 'Nom', required: true },
              { key: 'className', label: 'Classe', required: false },
              { key: 'tuitionFee', label: 'Frais de scolarité', required: false },
              { key: 'phone', label: 'Téléphone / contact parent', required: false },
              { key: 'dateOfBirth', label: 'Date de naissance', required: false },
              { key: 'wasEnrolled2025_2026', label: 'Inscrit en 2025-2026 ?', required: false },
              { key: 'arabicCourse', label: 'ARABE', required: false },
              { key: 'quranCourse', label: 'CORAN', required: false },
              { key: 'familyRef', label: 'ID Famille', required: false },
              { key: 'familySize', label: 'Nb élèves famille (informatif)', required: false },
              { key: 'parentName', label: 'Nom & prénom du parent', required: false },
              { key: 'parentEmail', label: 'Adresse e-mail parent', required: false },
              { key: 'parentAddress', label: 'Adresse parent', required: false },
              { key: 'ageInOctober2026', label: 'Âge en octobre 2026 (informatif)', required: false },
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
            <div className="max-h-96 overflow-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-white sticky top-0">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">#</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Prénom</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Nom</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Classe</th>
                    {columnMap.tuitionFee && <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Frais</th>}
                    {columnMap.phone && <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Téléphone</th>}
                    {columnMap.dateOfBirth && <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Naissance</th>}
                    {columnMap.parentName && <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Parent</th>}
                    {columnMap.parentEmail && <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">E-mail</th>}
                    {columnMap.familyRef && <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Famille</th>}
                    {columnMap.arabicCourse && <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">ARABE</th>}
                    {columnMap.quranCourse && <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase">CORAN</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mappedRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-5 py-3 text-sm font-medium text-slate-800">{row.firstName || <span className="text-red-400 italic">manquant</span>}</td>
                      <td className="px-5 py-3 text-sm text-slate-700">{row.lastName || <span className="text-red-400 italic">manquant</span>}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">{row.className || <span className="text-slate-300 italic">—</span>}</td>
                      {columnMap.tuitionFee && <td className="px-5 py-3 text-sm text-emerald-600 font-semibold">{row.tuitionFee ? formatCurrency(row.tuitionFee) : '—'}</td>}
                      {columnMap.phone && <td className="px-5 py-3 text-sm text-slate-500">{row.phone || <span className="text-slate-300 italic">—</span>}</td>}
                      {columnMap.dateOfBirth && <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">{row.dateOfBirth || '—'}</td>}
                      {columnMap.parentName && <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">{row.parentName || '—'}</td>}
                      {columnMap.parentEmail && <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">{row.parentEmail || '—'}</td>}
                      {columnMap.familyRef && <td className="px-5 py-3 text-sm text-slate-500">{row.familyRef || '—'}</td>}
                      {columnMap.arabicCourse && <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">{row.arabicCourse || '—'}</td>}
                      {columnMap.quranCourse && <td className="px-5 py-3 text-sm text-slate-500 whitespace-nowrap">{row.quranCourse || '—'}</td>}
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
          <div className="flex flex-wrap justify-center gap-4">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl px-8 py-5">
              <p className="text-3xl font-black text-primary">{result.createdStudents}</p>
              <p className="text-sm text-slate-600 mt-1">élève{result.createdStudents > 1 ? 's' : ''} créé{result.createdStudents > 1 ? 's' : ''}</p>
            </div>
            {!!result.updatedStudents && (
              <div className="bg-cyan-50 border border-cyan-100 rounded-2xl px-8 py-5">
                <p className="text-3xl font-black text-cyan-700">{result.updatedStudents}</p>
                <p className="text-sm text-slate-600 mt-1">fiche{result.updatedStudents > 1 ? 's' : ''} mise{result.updatedStudents > 1 ? 's' : ''} à jour</p>
              </div>
            )}
            {!!result.linkedFamilies && (
              <div className="bg-violet-50 border border-violet-100 rounded-2xl px-8 py-5">
                <p className="text-3xl font-black text-violet-700">{result.linkedFamilies}</p>
                <p className="text-sm text-slate-600 mt-1">famille{result.linkedFamilies > 1 ? 's' : ''} liée{result.linkedFamilies > 1 ? 's' : ''}</p>
              </div>
            )}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-8 py-5">
              <p className="text-3xl font-black text-indigo-600">{result.createdClasses}</p>
              <p className="text-sm text-slate-600 mt-1">classe{result.createdClasses > 1 ? 's' : ''} créée{result.createdClasses > 1 ? 's' : ''}</p>
            </div>
            {!!result.skipped && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl px-8 py-5">
                <p className="text-3xl font-black text-amber-600">{result.skipped}</p>
                <p className="text-sm text-slate-600 mt-1">ligne{result.skipped! > 1 ? 's' : ''} ignorée{result.skipped! > 1 ? 's' : ''}</p>
              </div>
            )}
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="text-left mx-auto max-w-md bg-red-50 border border-red-100 rounded-2xl p-4 text-sm">
              <p className="font-bold text-red-700 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                {result.errors.length} ligne{result.errors.length > 1 ? 's' : ''} ignorée{result.errors.length > 1 ? 's' : ''}
              </p>
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-red-600 text-xs">Ligne {e.row} — {e.reason}</li>
                ))}
              </ul>
            </div>
          )}
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
