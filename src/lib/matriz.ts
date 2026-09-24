/**
 * La matriz de actividades, editable desde la app.
 *
 * La pantalla 831 de la plataforma define, por curso y materia, qué actividad
 * va en cada casilla: su título, cuánto pesa, en qué ciclo cae y si es para
 * Casa o para Clase. Llenarla allá es fila por fila, con "Editar" y
 * "Actualizar" en cada una — unas diez por curso, diecinueve cursos.
 *
 * Acá se edita de una, y lo que sale es un plan que el script de planilla-v2
 * aplica en la plataforma. Tres reglas que el diseño no puede soltar:
 *
 * 1. **La app nunca inventa un id.** La fila de la plataforma lleva adentro el
 *    id de la actividad, el del logro y su `cod_mat`; el script los lee de la
 *    fila y los devuelve tal cual. Acá solo viajan los cuatro campos que la
 *    pantalla deja editar.
 * 2. **Se empareja por meta y posición, y se verifica.** El plan lleva lo que
 *    la app cree que hay HOY en cada fila (`antes`); si la pantalla no coincide,
 *    el script no escribe esa fila. La posición sola no es identidad — es el
 *    mismo problema que pegar notas de un Excel — y lo que la vuelve segura es
 *    que se compruebe contra lo que hay.
 * 3. **Nunca crea filas.** La plataforma trae ocho casillas por categoría,
 *    usadas o no; estrenar una actividad es llenar una casilla que ya existe.
 */
import type { SlotDef } from './constants';
import { catDeMeta, columnaDeDescripcion, type CursoLeido } from './actividades';

/** Para qué es la actividad. Los tres valores que ofrece la pantalla. */
export const DESTINOS = ['Casa', 'Clase', 'Casa-Clase'] as const;

/** Los ciclos del año, que son los mismos de la app. */
export const CICLOS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/** Las columnas reales del Califica. C1 no existe: la plataforma arranca en C2. */
export const COLUMNAS = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9'] as const;

export interface FilaMatriz {
  /** El rótulo de la meta tal como lo escribe la plataforma ('CONOCIMIENTO'). */
  meta: string;
  cat: SlotDef['cat'];
  /** La fila número N dentro de su meta, contando las casillas sin usar. */
  posicion: number;
  /** '' en una casilla sin estrenar. */
  columna: string;
  titulo: string;
  porcentaje: number;
  ciclo: string;
  destino: string;
  /** true si la casilla venía sin usar. */
  vacia: boolean;
}

/** `T3 - C4. TÍTULO`, o '' si la fila sigue sin estrenar. */
export function descripcionDe(f: FilaMatriz, trimestre: number): string {
  if (!f.columna) return '';
  const t = f.titulo.trim();
  return `T${trimestre} - ${f.columna}.${t ? ' ' + t : ''}`;
}

/**
 * Las filas editables de un curso, tal como están hoy en la plataforma.
 *
 * Mezcla las actividades con las casillas sin usar y ordena por meta y
 * posición, que es como se ven en pantalla.
 */
export function filasDeCurso(curso: CursoLeido): FilaMatriz[] {
  const filas: FilaMatriz[] = [];

  for (const a of curso.actividades) {
    const cat = catDeMeta(a.meta ?? '');
    if (!cat || !a.posicion) continue;
    filas.push({
      meta: a.meta,
      cat,
      posicion: a.posicion,
      columna: columnaDeDescripcion(a.descripcion ?? '') ?? '',
      titulo: tituloDe(a.descripcion ?? ''),
      porcentaje: a.porcentaje ?? 0,
      ciclo: a.ciclo ?? '',
      destino: a.destino ?? '',
      vacia: false,
    });
  }

  for (const v of curso.casillasSinUsar ?? []) {
    const cat = catDeMeta(v.meta ?? '');
    if (!cat || !v.posicion) continue;
    filas.push({
      meta: v.meta, cat, posicion: v.posicion,
      columna: '', titulo: '', porcentaje: 0, ciclo: '', destino: '',
      vacia: true,
    });
  }

  const orden = ['K', 'M', 'U', 'C', 'E'];
  return filas.sort((a, b) =>
    orden.indexOf(a.cat) - orden.indexOf(b.cat) || a.posicion - b.posicion);
}

/** Lo que queda de la descripción después de la columna. */
export function tituloDe(desc: string): string {
  const m = /T\s*\d+\s*[-–—]\s*C\s*\d+\s*[.\-–—]?\s*(.*)$/i.exec(desc);
  return (m?.[1] ?? '').trim();
}

// --- Validar ---------------------------------------------------------------

/**
 * Lo que no se puede mandar a la plataforma.
 *
 * Devuelve una lista vacía cuando está todo bien. No corrige nada: una matriz
 * a medio llenar es un estado legítimo mientras se edita, y solo deja de serlo
 * cuando se quiere aplicar.
 */
export function validarMatriz(filas: FilaMatriz[]): string[] {
  const problemas: string[] = [];
  const usadas = filas.filter(f => f.columna || f.titulo.trim() || f.porcentaje);

  for (const f of usadas) {
    const donde = `${f.meta} · fila ${f.posicion}`;
    if (!f.columna) problemas.push(`${donde}: falta la columna.`);
    if (!f.titulo.trim()) problemas.push(`${donde}: falta el título.`);
    if (f.porcentaje < 0 || f.porcentaje > 100) {
      problemas.push(`${donde}: el porcentaje tiene que estar entre 0 y 100.`);
    }
    if (!Number.isInteger(f.porcentaje)) {
      problemas.push(`${donde}: el porcentaje tiene que ser un número entero.`);
    }
    if (f.destino && !DESTINOS.includes(f.destino as typeof DESTINOS[number])) {
      problemas.push(`${donde}: "${f.destino}" no es un destino de la plataforma.`);
    }
  }

  // Cada categoría suma 100%. Es lo que hace que el promedio ponderado de la
  // fórmula sea un promedio: sin esto la definitiva sale de otra escala.
  for (const cat of ['K', 'M', 'U', 'C', 'E'] as const) {
    const suyas = usadas.filter(f => f.cat === cat);
    if (!suyas.length) {
      problemas.push(`La categoría ${cat} se quedó sin ninguna actividad.`);
      continue;
    }
    const suma = suyas.reduce((a, f) => a + f.porcentaje, 0);
    if (suma !== 100) problemas.push(`La categoría ${cat} suma ${suma}%, no 100%.`);
  }

  // Dos actividades de la misma categoría en la misma columna se pisarían: la
  // nota se escribe una vez por columna real.
  for (const cat of ['K', 'M', 'U', 'C', 'E'] as const) {
    const cols = usadas.filter(f => f.cat === cat).map(f => f.columna);
    const repetida = cols.find((c, i) => c && cols.indexOf(c) !== i);
    if (repetida) {
      problemas.push(`La categoría ${cat} usa ${repetida} dos veces.`);
    }
  }
  return problemas;
}

/** Los slots que describen estas filas, para que la app calcule con ellos. */
export function slotsDeFilas(filas: FilaMatriz[]): SlotDef[] {
  const orden = ['K', 'M', 'U', 'C', 'E'];
  const usadas = [...filas]
    .filter(f => f.columna && f.porcentaje > 0)
    .sort((a, b) => orden.indexOf(a.cat) - orden.indexOf(b.cat) || a.posicion - b.posicion);

  const vistos = new Map<SlotDef['cat'], number>();
  return usadas.map(f => {
    const n = (vistos.get(f.cat) ?? 0) + 1;
    vistos.set(f.cat, n);
    return {
      key: f.cat === 'E' ? `EV_${f.columna}` : `${f.cat}${n}_${f.columna}`,
      cat: f.cat,
      weight: f.porcentaje / 100,
    };
  });
}

// --- El plan que se manda a la plataforma ----------------------------------

export interface ValoresFila {
  descripcion: string;
  porcentaje: number;
  ciclo: string;
  destino: string;
}

export interface CambioFila {
  meta: string;
  posicion: number;
  antes: ValoresFila;
  despues: ValoresFila;
  /** Qué campos cambian, para mostrarlo sin hacer cuentas en la pantalla. */
  campos: string[];
}

export interface PlanMatriz {
  generadoEn: string;
  trimestre: number;
  grados: { grado: number; cursos: string[]; cambios: CambioFila[] }[];
}

const valoresDe = (f: FilaMatriz, trimestre: number): ValoresFila => ({
  descripcion: descripcionDe(f, trimestre),
  porcentaje: f.porcentaje,
  ciclo: f.ciclo,
  destino: f.destino,
});

const ETIQUETA: Record<keyof ValoresFila, string> = {
  descripcion: 'título', porcentaje: 'porcentaje', ciclo: 'ciclo', destino: 'destino',
};

/**
 * Las filas que cambian, con lo que había antes para que el script verifique.
 *
 * Las que quedaron igual no viajan: cada fila que viaja es un "Editar" y un
 * "Actualizar" en la plataforma, y no tocar lo que no cambió es tanto más
 * rápido como menos superficie donde algo puede salir mal.
 */
export function cambiosDeGrado(
  originales: FilaMatriz[],
  editadas: FilaMatriz[],
  trimestre: number,
): CambioFila[] {
  const antesDe = new Map(originales.map(f => [`${f.meta}|${f.posicion}`, f]));
  const cambios: CambioFila[] = [];

  for (const f of editadas) {
    const original = antesDe.get(`${f.meta}|${f.posicion}`);
    if (!original) continue;              // no se inventan filas
    const antes = valoresDe(original, trimestre);
    const despues = valoresDe(f, trimestre);
    const campos = (Object.keys(ETIQUETA) as (keyof ValoresFila)[])
      .filter(k => antes[k] !== despues[k])
      .map(k => ETIQUETA[k]);
    if (campos.length) {
      cambios.push({ meta: f.meta, posicion: f.posicion, antes, despues, campos });
    }
  }
  return cambios;
}

/** El texto que se copia y se pega en el panel del script. */
export function jsonParaPlataforma(plan: PlanMatriz): string {
  return JSON.stringify(plan, null, 2);
}

/** Cuántas filas va a tocar el plan. */
export const totalCambios = (plan: PlanMatriz) =>
  plan.grados.reduce((a, g) => a + g.cambios.length, 0);
