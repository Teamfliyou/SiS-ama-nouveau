import CsvImport from '../CsvImport';
import PageHeader from '../../components/liquid/PageHeader';

/** Import CSV en présentation Liquid : la logique d'import est réutilisée telle quelle. */
export default function LiquidCsvImport() {
  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <PageHeader
        title="Import CSV"
        subtitle="Importez des élèves et leurs classes depuis un fichier CSV."
      />
      <CsvImport embedded />
    </div>
  );
}
