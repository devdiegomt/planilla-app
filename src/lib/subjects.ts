import type { SubjectConfig, YearConfig } from '@/types';
import { slotsFor, type SlotDef } from './constants';

/**
 * Las materias del docente, por grado.
 *
 * Antes era la constante `GRADE_META`, con Informática de 8° a 11° fija en el
 * código: un docente de otra materia o de otro grado no existía en el modelo.
 * Ahora vive en `YearConfig.subjects`, que ya es una tabla sincronizable, así
 * que no hace falta registrar una tabla nueva en los tres lugares de siempre.
 *
 * Es por año porque el `cod_mat` lo es: 2508 y 2509 llevan el año de la
 * matrícula adentro.
 */

/**
 * Lo que decía `GRADE_META`. Solo lo usa la migración de la v13, para que la
 * base que ya existe siga funcionando igual. Una instalación nueva arranca sin
 * materias y las pide en Ajustes: sembrarle estos valores a otro docente le
 * marcaría la asistencia bajo la asignatura equivocada sin avisar.
 */
export const MATERIAS_HEREDADAS: SubjectConfig[] = [
  { grade: 8,  codMat: '2508', materia: 'Information Technology' },
  { grade: 9,  codMat: '2509', materia: 'Information Technology' },
  { grade: 10, codMat: '2510', materia: 'Information Technology' },
  { grade: 11, codMat: '3011', materia: 'Informática y tecnología' },
];

/** La materia configurada para un grado, o undefined si falta. */
export function subjectFor(
  cfg: Pick<YearConfig, 'subjects'> | undefined,
  grade: number,
): SubjectConfig | undefined {
  return cfg?.subjects?.find(s => s.grade === grade);
}

/** Los grados que todavía no tienen materia configurada. */
export function gradesSinMateria(
  cfg: Pick<YearConfig, 'subjects'> | undefined,
  grades: number[],
): number[] {
  return grades.filter(g => {
    const s = subjectFor(cfg, g);
    return !s?.materia.trim();
  });
}

/** Deja la lista ordenada por grado y sin repetidos, quedándose con el último. */
export function normalizeSubjects(subjects: SubjectConfig[]): SubjectConfig[] {
  const byGrade = new Map<number, SubjectConfig>();
  for (const s of subjects) {
    if (!s.materia.trim() && !s.codMat.trim()) continue;
    byGrade.set(s.grade, { ...s, codMat: s.codMat.trim(), materia: s.materia.trim() });
  }
  return [...byGrade.values()].sort((a, b) => a.grade - b.grade);
}

/**
 * Los pesos internos de las subnotas de un grado.
 *
 * Si el docente trajo la matriz de actividades de la plataforma, son los suyos;
 * si no, los de las constantes. Medidos el 24/09/2026 contra la pantalla 831,
 * los fijos resultaron exactos para 8°, 9°, 10° y 11° **de informática**: no
 * son un error, son los de una materia sola.
 */
export function slotsOf(
  cfg: Pick<YearConfig, 'subjects'> | undefined,
  grade: number,
): SlotDef[] {
  const propios = subjectFor(cfg, grade)?.slots;
  return slotsFor(grade, cfg?.subjects);
}

/** Deja los pesos leídos en la materia de ese grado, creándola si no estaba. */
export function conSlots(
  subjects: SubjectConfig[] | undefined,
  grade: number,
  slots: SlotDef[],
): SubjectConfig[] {
  const lista = subjects ?? [];
  if (lista.some(s => s.grade === grade)) {
    return lista.map(s => (s.grade === grade ? { ...s, slots } : s));
  }
  // Sin pasar por normalizeSubjects a propósito: tira las materias vacías, y
  // acá la materia todavía puede estarlo. Los pesos del grado son válidos
  // aunque el docente no haya escrito aún el nombre ni el código.
  return [...lista, { grade, codMat: '', materia: '', slots }]
    .sort((a, b) => a.grade - b.grade);
}
