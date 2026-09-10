'use client';

import { use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getCourseByCode } from '@/lib/db';
import { PlanillaGrid } from '@/components/PlanillaGrid';
import { ExportCalifica } from '@/components/ExportCalifica';
import { CourseNav } from '@/components/CourseNav';
import { ExportObservations } from '@/components/ExportObservations';
import { CicloAttendance } from '@/components/CicloAttendance';
import { CourseDashboard } from '@/components/CourseDashboard';
import { ChangeLogView } from '@/components/ChangeLogView';
import { EventsList } from '@/components/EventsList';
import { PendientesList } from '@/components/PendientesList';
import type { Student } from '@/types';

export default function CoursePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const searchParams = useSearchParams();
  // Sin `?ciclo` se deja indefinido a propósito: CicloAttendance cae entonces
  // en el ciclo en curso. Forzar 1 aquí hacía marcar la asistencia de hoy
  // sobre el primer ciclo del trimestre.
  const cicloParam = parseInt(searchParams.get('ciclo') ?? '') || undefined;

  const course = useLiveQuery(() => getCourseByCode(code), [code]);
  const students = useLiveQuery<Student[]>(
    () => course?.id
      ? db.students.where('courseId').equals(course.id).sortBy('order')
      : Promise.resolve<Student[]>([]),
    [course?.id]
  );

  if (!course) {
    return (
      <main className="p-6 max-w-5xl mx-auto">
        <p>Cargando curso {code}...</p>
      </main>
    );
  }

  const activos: Student[] = students?.filter(s => !s.withdrawnAt) ?? [];

  return (
    <main className="max-w-full mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-neutral-500 hover:underline">← Cursos</Link>
          <div className="flex items-center gap-3 mt-1">
            <CourseNav code={course.code} ciclo={cicloParam} />
            <h1 className="text-xl font-semibold">
              {course.code} <span className="text-neutral-500">· {course.director}</span>
            </h1>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <ExportObservations course={course} students={activos} />
          <ExportCalifica course={course} students={activos} trimestre={course.trimestre} />
        </div>
      </div>

      <CourseDashboard course={course} />

      <section>
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-2">
          Próximas entregas y actividades
        </h2>
        <EventsList courseCode={course.code} onlyUpcoming limit={10} />
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-2">
          Pendientes del curso
        </h2>
        <PendientesList courseCode={course.code} />
      </section>

      <CicloAttendance course={course} initialCiclo={cicloParam} />

      <PlanillaGrid course={course} />

      <ChangeLogView course={course} />
    </main>
  );
}
