import type { Course } from '@/types';

/**
 * Orden y grados de los cursos del docente.
 *
 * Antes esto salía de `CURSOS_ORDER`, una lista fija con los 19 cursos de
 * Diego. Eso ataba la app a un solo docente: otro profesor, con otros cursos u
 * otros grados, no aparecía en ninguna lista ni en el desplegable del horario.
 *
 * El código de curso ya lleva el grado adentro (801 → 8°, 1104 → 11°), así que
 * el orden del colegio es simplemente el orden numérico del código: 801…806,
 * 901…905, 1001…1004, 1101…1104. No hace falta una lista; hace falta ordenar.
 */

/** Compara dos códigos de curso. Los no numéricos van al final, alfabéticos. */
export function compareCourseCodes(a: string, b: string): number {
  const na = parseInt(a, 10), nb = parseInt(b, 10);
  const aNum = Number.isFinite(na), bNum = Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}

/** Los cursos del docente en el orden del colegio. No muta la entrada. */
export function sortCourses<T extends { code: string }>(courses: T[]): T[] {
  return [...courses].sort((a, b) => compareCourseCodes(a.code, b.code));
}

/** Los códigos, ordenados. */
export function sortedCourseCodes(courses: { code: string }[]): string[] {
  return sortCourses(courses).map(c => c.code);
}

/** Los grados que el docente realmente dicta, de menor a mayor. */
export function gradesOf(courses: Pick<Course, 'grade'>[]): number[] {
  return [...new Set(courses.map(c => c.grade))].sort((a, b) => a - b);
}
