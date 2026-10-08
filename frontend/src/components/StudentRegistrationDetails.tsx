import type { Student } from '../hooks/useStudents';
import { ageOn, frenchDate } from '../utils/preRegistration';
import { localToday } from '../utils/schedule';

export default function StudentRegistrationDetails({ student }: { student: Student }) {
  return (<>
              {/* Child file (filled from the online pre-registration) */}
              {(student.birthDate || student.medicalInfo || student.guardians?.length > 0) && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    {student.birthDate && (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                        {student.gender === 'F' ? 'Née' : student.gender === 'M' ? 'Né' : 'Naissance'} le {frenchDate(student.birthDate)} ({ageOn(student.birthDate, localToday())} ans)
                      </span>
                    )}
                    <span className={`px-2.5 py-1 rounded-lg ${student.photoOptOut ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                      {student.photoOptOut ? 'Refus des photos' : 'Photos autorisées'}
                    </span>
                    <span className={`px-2.5 py-1 rounded-lg ${student.canLeaveAlone ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-800'}`}>
                      {student.canLeaveAlone ? 'Rentre seul(e)' : 'Ne rentre pas seul(e)'}
                    </span>
                  </div>
                  {student.medicalInfo && (
                    <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"><span className="font-semibold">Informations médicales :</span> {student.medicalInfo}</p>
                  )}
                  {student.guardians?.map((g) => (
                    <div key={g.id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">{g.firstName} {g.lastName.toUpperCase()} <span className="font-normal text-slate-500">· {g.relationship}</span></p>
                      <p className="flex flex-wrap gap-x-4">
                        <a href={`tel:${g.phone.replace(/\s/g, '')}`} className="text-primary">{g.phone}</a>
                        <a href={`mailto:${g.email}`} className="text-primary break-all">{g.email}</a>
                      </p>
                      {g.address && <p className="text-slate-500">{g.address}</p>}
                    </div>
                  ))}
                </div>
              )}

  </>);
}
