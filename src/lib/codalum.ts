/**
 * Puente con planilla-v2 — el userscript `codalum-extractor` que recorre los 19
 * cursos en Classroom Live y baja un JSON con el COD_ALUM de cada estudiante.
 *
 * Por qué importa: `Student.codAlum` es la clave con la que la plataforma
 * identifica a un estudiante, y hasta ahora vivía en un mapa en `localStorage`
 * construido desde el Califica-451. Eso no sincronizaba entre dispositivos, se
 * perdía al limpiar el navegador y obligaba al exportador a hacer fuzzy match
 * por nombre en cada corrida. Con el JSON del extractor el código se escribe
 * sobre la fila del estudiante, que sí viaja por el sync.
 *
 * Formato (ver README de planilla-v2):
 *   { generado, cursos: [{ cod_cur, cod_gru, cod_mat, estudiantes: [...] }], errores }
 */

import { GRADE_META } from './constants';

export interface CodAlumStudent {
  cod_alum: string;
  nombre: string;
}

export interface CodAlumCourse {
  cod_cur: string;                    // '801'
  cod_gru: string;                    // '08'
  cod_mat: string;                    // '2508'
  estudiantes: CodAlumStudent[];
}

export interface CodAlumJson {
  generado: string;                   // ISO datetime
  cursos: CodAlumCourse[];
  errores: unknown[];
}

/** Un COD_ALUM válido son exactamente 10 dígitos y arranca con el año de matrícula. */
const COD_ALUM_RE = /^\d{10}$/;

export interface ParseWarning {
  course: string;
  message: string;
}

export interface ParsedCodAlum {
  generado: string;
  courses: CodAlumCourse[];
  warnings: ParseWarning[];
  totalStudents: number;
}

/**
 * Valida y normaliza el JSON del extractor.
 *
 * Lanza solo si el archivo no es del extractor. Los problemas por curso
 * (código de grado que no cuadra, cod_alum malformado) se acumulan como
 * warnings: un curso raro no debe impedir hidratar los otros 18.
 */
export function parseCodAlumJson(text: string): ParsedCodAlum {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es JSON válido.');
  }

  const obj = raw as Partial<CodAlumJson>;
  if (!obj || !Array.isArray(obj.cursos)) {
    throw new Error(
      'No parece el JSON del extractor: falta el arreglo "cursos". ' +
      '¿Subiste el archivo que baja codalum-extractor?',
    );
  }

  const warnings: ParseWarning[] = [];
  const courses: CodAlumCourse[] = [];
  let totalStudents = 0;

  for (const c of obj.cursos) {
    const code = String(c?.cod_cur ?? '').trim();
    if (!code) {
      warnings.push({ course: '(sin código)', message: 'Curso sin cod_cur, omitido.' });
      continue;
    }
    if (!Array.isArray(c.estudiantes)) {
      warnings.push({ course: code, message: 'Sin arreglo "estudiantes", omitido.' });
      continue;
    }

    // El grado que reporta la plataforma debe cuadrar con el que deduce la app
    // del código de curso ('801' → 8). Si no cuadra, el JSON o la constante
    // están desactualizados y conviene enterarse antes de escribir nada.
    const gradeFromCode = Math.floor(parseInt(code, 10) / 100);
    const gradeFromGru = parseInt(String(c.cod_gru ?? ''), 10);
    if (Number.isFinite(gradeFromGru) && gradeFromGru !== gradeFromCode) {
      warnings.push({
        course: code,
        message: `cod_gru "${c.cod_gru}" no cuadra con el grado ${gradeFromCode} del código de curso.`,
      });
    }
    const expectedMat = GRADE_META[gradeFromCode]?.codMat;
    const gotMat = String(c.cod_mat ?? '').trim();
    if (expectedMat && gotMat && gotMat !== expectedMat) {
      warnings.push({
        course: code,
        message: `cod_mat "${gotMat}" ≠ "${expectedMat}" esperado para grado ${gradeFromCode}.`,
      });
    }

    const estudiantes: CodAlumStudent[] = [];
    for (const s of c.estudiantes) {
      const cod = String(s?.cod_alum ?? '').trim();
      const nombre = String(s?.nombre ?? '').trim();
      if (!nombre) continue;
      if (!COD_ALUM_RE.test(cod)) {
        warnings.push({
          course: code,
          message: `"${nombre}" tiene cod_alum inválido ("${cod}"), se omite.`,
        });
        continue;
      }
      estudiantes.push({ cod_alum: cod, nombre });
    }

    totalStudents += estudiantes.length;
    courses.push({
      cod_cur: code,
      cod_gru: String(c.cod_gru ?? ''),
      cod_mat: gotMat,
      estudiantes,
    });
  }

  if (courses.length === 0) {
    throw new Error('El JSON no trae ningún curso utilizable.');
  }

  // El extractor reporta sus propios fallos; se propagan para que no pasen
  // desapercibidos (un curso que no pudo exportar sale con menos estudiantes).
  if (Array.isArray(obj.errores)) {
    for (const e of obj.errores) {
      warnings.push({ course: '(extractor)', message: String(
        typeof e === 'string' ? e : JSON.stringify(e),
      ) });
    }
  }

  return {
    generado: String(obj.generado ?? ''),
    courses,
    warnings,
    totalStudents,
  };
}
