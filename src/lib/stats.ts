/**
 * Estadísticas del curso — funciones puras sobre estudiantes + subnotas.
 */

import { calcDef } from './formula';
import { slotsFor, NOTA_APROBACION, NOTA_EXPERTO, NOTA_MIN } from './constants';
import type { Student, AttendanceMark } from '@/types';

export interface StudentDef {
  student: Student;
  def: number;
  cats: { K: number; M: number; U: number; C: number; E: number };
}

export interface CourseStats {
  activos: number;
  promedio: number;                    // DEF media (redondeada)
  mediana: number;
  aprobando: number;                   // DEF >= NOTA_APROBACION
  aprobandoPct: number;
  experto: number;                     // DEF >= NOTA_EXPERTO
  expertoPct: number;
  reprobando: number;                  // DEF < NOTA_APROBACION
  enRiesgo: StudentDef[];              // 70 <= DEF < 75 (border)
  reprobados: StudentDef[];            // DEF < 70
  expertos: StudentDef[];              // DEF >= NOTA_EXPERTO
  distribution: {
    min30_59: number;
    r60_69: number;
    r70_79: number;
    r80_89: number;
    r90_100: number;
  };
  categoryAverages: { K: number; M: number; U: number; C: number; E: number };
  perStudent: StudentDef[];
}

export function computeCourseStats(students: Student[], grade: number): CourseStats {
  const activos = students.filter(s => !s.withdrawnAt);
  const slots = slotsFor(grade);

  const perStudent: StudentDef[] = activos.map(s => {
    const d = calcDef(s.subnotas, slots, 'platform');
    return {
      student: s,
      def: d.definitiva,
      cats: { K: d.K, M: d.M, U: d.U, C: d.C, E: d.E },
    };
  });

  const defs = perStudent.map(p => p.def);
  const promedio = defs.length ? Math.round(defs.reduce((a, b) => a + b, 0) / defs.length) : 0;
  const sorted = [...defs].sort((a, b) => a - b);
  const mediana = sorted.length
    ? sorted.length % 2 === 0
      ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
      : sorted[Math.floor(sorted.length / 2)]
    : 0;

  const aprobando = perStudent.filter(p => p.def >= NOTA_APROBACION).length;
  const experto = perStudent.filter(p => p.def >= NOTA_EXPERTO).length;
  const reprobando = perStudent.filter(p => p.def < NOTA_APROBACION).length;

  const enRiesgo = perStudent
    .filter(p => p.def >= NOTA_APROBACION && p.def < NOTA_APROBACION + 5)
    .sort((a, b) => b.def - a.def);
  const reprobados = perStudent
    .filter(p => p.def < 70 && p.def >= NOTA_MIN)
    .sort((a, b) => a.def - b.def);
  const expertos = perStudent
    .filter(p => p.def >= NOTA_EXPERTO)
    .sort((a, b) => b.def - a.def);

  const distribution = {
    min30_59: perStudent.filter(p => p.def >= NOTA_MIN && p.def < 60).length,
    r60_69:   perStudent.filter(p => p.def >= 60 && p.def < 70).length,
    r70_79:   perStudent.filter(p => p.def >= 70 && p.def < 80).length,
    r80_89:   perStudent.filter(p => p.def >= 80 && p.def < 90).length,
    r90_100:  perStudent.filter(p => p.def >= 90 && p.def <= 100).length,
  };

  const categoryAverages = { K: 0, M: 0, U: 0, C: 0, E: 0 };
  if (perStudent.length) {
    for (const cat of ['K', 'M', 'U', 'C', 'E'] as const) {
      const vals = perStudent.map(p => p.cats[cat]).filter(v => v > 0);
      categoryAverages[cat] = vals.length
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        : 0;
    }
  }

  return {
    activos: activos.length,
    promedio, mediana,
    aprobando,
    aprobandoPct: activos.length ? Math.round((aprobando / activos.length) * 100) : 0,
    experto,
    expertoPct: activos.length ? Math.round((experto / activos.length) * 100) : 0,
    reprobando,
    enRiesgo, reprobados, expertos,
    distribution,
    categoryAverages,
    perStudent,
  };
}

// ---- Estadísticas de asistencia (F/R) ----

export interface AttendanceStats {
  ciclosConfirmados: number;           // # ciclos con AttendanceMark
  ultimaConfirmacion: string | null;   // ISO datetime más reciente
  totalFallas: number;                 // todas, justificadas incluidas
  totalFallasJust: number;             // subconjunto justificado
  totalRetardos: number;
  totalRetardosJust: number;
  topFallas: { nombre: string; F: number; Fj: number; R: number; Rj: number }[];
}

export function computeAttendanceStats(
  students: Student[],
  marks: AttendanceMark[],
  courseId: number,
): AttendanceStats {
  const activos = students.filter(s => !s.withdrawnAt);
  const courseMarks = marks.filter(m => m.courseId === courseId);

  const ultimaConfirmacion = courseMarks.length
    ? courseMarks.map(m => m.confirmedAt).sort().at(-1)!
    : null;

  let totalFallas = 0, totalFallasJust = 0;
  let totalRetardos = 0, totalRetardosJust = 0;
  const perStudent: AttendanceStats['topFallas'] = [];

  for (const s of activos) {
    let F = 0, Fj = 0, R = 0, Rj = 0;
    for (const c of s.cycles) {
      if (c.F) { F++; if (c.Fj) Fj++; }
      if (c.R) { R++; if (c.Rj) Rj++; }
    }
    totalFallas += F; totalFallasJust += Fj;
    totalRetardos += R; totalRetardosJust += Rj;
    if (F > 0 || R > 0) perStudent.push({ nombre: s.nombre, F, Fj, R, Rj });
  }

  // El ranking pondera solo lo injustificado: quien falta con excusa no es un
  // caso a vigilar, y mezclarlos escondía a los que sí lo son.
  const weight = (x: AttendanceStats['topFallas'][number]) =>
    (x.F - x.Fj) * 2 + (x.R - x.Rj);
  const topFallas = perStudent
    .filter(x => weight(x) > 0)
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, 5);

  return {
    ciclosConfirmados: courseMarks.length,
    ultimaConfirmacion,
    totalFallas, totalFallasJust,
    totalRetardos, totalRetardosJust,
    topFallas,
  };
}
