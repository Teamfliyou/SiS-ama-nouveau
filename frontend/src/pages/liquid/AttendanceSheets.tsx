import AttendanceSheets from '../AttendanceSheets';
import PageHeader from '../../components/liquid/PageHeader';

/** Feuilles d'appel en présentation Liquid ; la génération/impression reste identique. */
export default function LiquidAttendanceSheets() {
  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <PageHeader
        title="Feuilles d'appel"
        subtitle="Générez une feuille imprimable par classe (5 séances hebdomadaires)."
      />
      <AttendanceSheets embedded />
    </div>
  );
}
