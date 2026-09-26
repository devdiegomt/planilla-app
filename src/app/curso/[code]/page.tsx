'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getCourseByCode } from '@/lib/db';
import { PlanillaGrid } from '@/components/PlanillaGrid';
import { ExportCalifica } from '@/components/ExportCalifica';
import { CourseNav } from '@/components/CourseNav';
import { DirectorField } from '@/components/DirectorField';
import { ExportObservations } from '@/components/ExportObservations';
import { CicloAttendance } from '@/components/CicloAttendance';
import { CourseDashboard } from '@/components/CourseDashboard';
import { ChangeLogView } from '@/components/ChangeLogView';
import { EventsList } from '@/components/EventsList';
import { PendientesList } from '@/components/PendientesList';
import { Deberes } from '@/components/Deberes';
import { HistorialTrimestres } from '@/components/HistorialTrimestres';
import { Seccion, SeccionFija } from '@/components/Seccion';
import { computeCourseStats } from '@/lib/stats';
import type { Student } from '@/types';
import { useSubjects } from '@/lib/useSubjects';

export default function CoursePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const searchParams = useSearchParams();
  // Sin `?ciclo` se deja indefinido a propósito: CicloAttendance cae entonces
  // en el ciclo en curso. Forzar 1 aquí hacía marcar la asistencia de hoy
  // sobre el primer ciclo del trimestre.
  const cicloParam = parseInt(searchParams.get('ciclo') ?? '') || undefined;

  const course = useLiveQuery(() => getCourseByCode(code), [code]);
  const subjects = useSubjects();
  const students = useLiveQuery<Student[]>(
    () => course?.id
      ? db.students.where('courseId').equals(course.id).sortBy('order')
      : Promise.resolve<Student[]>([]),
    [course?.id]
  );

  /*
   * La línea que se ve cuando "Resumen del curso" está plegada. Plegar no puede
   * significar perder el dato de un vistazo, que es para lo que sirve.
   *
   * Va ANTES del return de "Cargando": un hook después de un return temprano se
   * deja de llamar en cuanto el curso carga, y React corta con "rendered more
   * hooks than during the previous render". El typecheck no lo ve.
   */
  const resumenCurso = useMemo(() => {
    const vivos = students?.filter(s => !s.withdrawnAt) ?? [];
    if (!course || vivos.length === 0) return null;
    const st = computeCourseStats(vivos, course.grade, subjects);
    return `${st.activos} activos · promedio ${st.promedio} · ${st.aprobandoPct}% aprobando`;
  }, [students, course, subjects]);

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
      {/*
        * En el celular el encabezado va en dos pisos.
        *
        * Era una sola fila con `justify-between`, y los dos botones de la
        * derecha no ceden ancho —"Generar Califica del curso 1102" no se parte
        * en nada angosto—, así que a 360px el botón se salía del borde y se
        * montaba sobre el título. `min-w-0` en los dos lados por lo de siempre:
        * un hijo de flex trae `min-width: auto` y se niega a bajar del ancho
        * de su contenido.
        */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="min-w-0">
          <Link href="/" className="text-sm text-neutral-500 hover:underline">← Cursos</Link>
          <div className="flex items-center gap-3 mt-1 min-w-0">
            <CourseNav code={course.code} ciclo={cicloParam} />
            <h1 className="text-xl font-semibold flex items-center gap-2 min-w-0">
              {course.code}
              {/* El Califica no trae el director: se escribe acá cuando haga falta. */}
              <DirectorField course={course} />
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2 min-w-0 sm:justify-end">
          <ExportObservations course={course} students={activos} />
          <ExportCalifica course={course} students={activos} trimestre={course.trimestre} />
        </div>
      </div>

      {/*
        * El orden lo pide el trabajo diario: primero asistencia, después notas.
        * Lo demás son cosas que se miran de vez en cuando, así que van plegadas
        * y cada una recuerda cómo la dejaste.
        */}
      <Seccion id="asistencia" titulo="Asistencia del ciclo" defaultOpen>
        <CicloAttendance course={course} initialCiclo={cicloParam} />
      </Seccion>

      {/* Las notas no se pliegan: es a lo que se entra a hacer. */}
      <SeccionFija titulo="Notas del trimestre">
        <PlanillaGrid course={course} />
      </SeccionFija>

      <Seccion id="resumen" titulo="Resumen del curso" resumen={resumenCurso}>
        <CourseDashboard course={course} />
      </Seccion>

      <Seccion id="historial" titulo="Cómo viene cada estudiante">
        <HistorialTrimestres course={course} students={activos} />
      </Seccion>

      <Seccion id="entregas" titulo="Próximas entregas y actividades">
        <EventsList courseCode={course.code} onlyUpcoming limit={10} />
      </Seccion>

      <Seccion id="pendientes" titulo="Pendientes del curso">
        {/* Lo que la app ve de ESTE curso, y debajo lo anotado a mano. */}
        <div className="space-y-4">
          <Deberes courseCode={course.code} />
          <PendientesList courseCode={course.code} />
        </div>
      </Seccion>

      <Seccion id="cambios" titulo="Cambios recientes">
        <ChangeLogView course={course} />
      </Seccion>
    </main>
  );
}
