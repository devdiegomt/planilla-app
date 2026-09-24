'use client';

import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, updateColumnValue, updateColumnObservation } from '@/lib/db';
import {
  slotsFor, columnsFor,
  NOTA_APROBACION, NOTA_EXPERTO,
} from '@/lib/constants';
import { calcDef } from '@/lib/formula';
import { nextCell, sanitizeNota, notaValue } from '@/lib/gridNav';
import { planPaste, type PastePlan } from '@/lib/pasteNotas';
import { PasteNotasPreview } from './PasteNotasPreview';
import type { Course } from '@/types';
import { useSubjects } from '@/lib/useSubjects';

interface Props {
  course: Course;
}

/** Cómo se encuentra una casilla desde otra en el DOM. */
function notaCellId(row: number, col: number): string {
  return `${row}-${col}`;
}

/**
 * Vista tipo "planilla digital" — un input por columna real de la plataforma
 * (C2..C9 + EV). Cuando una columna alimenta más de una categoría (ej. C4 en
 * K y C), el input se propaga a los slots correspondientes al guardar.
 * La definitiva usa el algoritmo real de la plataforma (ignore-zeros).
 * Cada celda soporta una observación docente por columna (popover con textarea).
 *
 * Se recorre con el teclado como una hoja de cálculo: las flechas cambian de
 * casilla en vez de subir y bajar el número. Cada casilla lleva su fila y su
 * columna en `data-nota` y el salto busca la de destino por ahí — con refs
 * habría que mantener una matriz que se rearma en cada tecleo, porque guardar
 * la nota vuelve a dibujar la tabla entera.
 *
 * También se puede pegar una columna de notas desde un Excel. Nunca se aplica
 * de una: se arma un plan (`lib/pasteNotas`) y se muestra para revisar, porque
 * una columna de puros números empareja por posición y basta que el Excel esté
 * ordenado distinto para que cada nota caiga en otro estudiante sin que nada
 * se vea raro.
 */

export function PlanillaGrid({ course }: Props) {
  const students = useLiveQuery(
    () => db.students.where('courseId').equals(course.id!).sortBy('order'),
    [course.id]
  );
  // Antes del return temprano de abajo: los hooks no pueden quedar detrás de
  // un `if`.
  const [pastePlan, setPastePlan] = useState<PastePlan | null>(null);
  const subjects = useSubjects(course.year);

  if (!students) return <p className="text-sm text-neutral-500">Cargando...</p>;

  const activos = students.filter(s => !s.withdrawnAt);
  const slots = slotsFor(course.grade, subjects);
  const columns = columnsFor(course.grade, subjects);
  // Nombres reales de los logros, si ya se leyeron de la plantilla Califica.
  const titleByColumn = new Map(
    (course.achievements ?? [])
      .filter(a => a.column && a.title)
      .map(a => [a.column, a.title]),
  );

  // Cuántas casillas siguen en 0. Es el número que responde "¿qué me falta?"
  // sin tener que barrer la grilla con la vista.
  const pendientes = activos.reduce(
    (n, s) => n + columns.filter(col => (s.subnotas[col.slotKeys[0]] ?? 0) === 0).length,
    0,
  );

  /**
   * Repartir lo que se pegó desde el Excel.
   *
   * Devuelve `true` si se hizo cargo, para que la casilla frene el pegado
   * normal del navegador. Una sola celda no se intercepta: ahí no hay nada que
   * repartir y pegar dentro de la casilla es lo correcto.
   */
  const pegar = (texto: string, row: number, col: number): boolean => {
    const plan = planPaste(
      texto,
      activos.map((s, i) => ({
        row: i,
        id: s.id!,
        nombre: s.nombre,
        codAlum: s.codAlum,
        current: Object.fromEntries(
          columns.map(c => [c.column, s.subnotas[c.slotKeys[0]] ?? 0]),
        ),
      })),
      columns.map(c => ({ column: c.column, slotKeys: c.slotKeys })),
      row,
      col,
    );
    if (!plan) return false;
    setPastePlan(plan);
    return true;
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b bg-neutral-50 text-left">
            <th className="p-2 sticky left-0 z-10 bg-neutral-50">#</th>
            <th className="p-2 sticky left-8 z-10 bg-neutral-50">Estudiante</th>
            {columns.map(col => {
              const isEv = col.cats.length === 1 && col.cats[0] === 'E';
              const logro = titleByColumn.get(col.column);
              const base = logro
                ? `${col.column} · ${logro}\n${col.slotKeys.join(' + ')}`
                : col.slotKeys.join(' + ');
              return (
                <th
                  key={col.column}
                  className={`p-2 text-center whitespace-nowrap ${
                    isEv ? 'bg-amber-100 border-x-2 border-amber-400' : ''
                  }`}
                  title={
                    isEv
                      ? `${base}\nNota de evaluación: 100% de la categoría E (peso 20% de la DEF)`
                      : base
                  }
                >
                  <div className={isEv ? 'font-bold text-amber-900' : ''}>
                    {col.column}
                    {isEv && <span className="ml-1 text-[11px]">★</span>}
                  </div>
                  <div className={`text-[9px] font-normal ${isEv ? 'text-amber-800' : 'text-neutral-500'}`}>
                    {col.cats.join('·')}
                  </div>
                </th>
              );
            })}
            <th className="p-2 text-center bg-neutral-100">DEF</th>
          </tr>
        </thead>
        <tbody>
          {activos.map((s, i) => {
            const def = calcDef(s.subnotas, slots, 'platform');
            const defColor = def.definitiva >= NOTA_EXPERTO ? 'text-green-700 font-semibold'
                           : def.definitiva >= NOTA_APROBACION ? 'text-neutral-800'
                           : 'text-red-700';
            return (
              <tr key={s.id} className="border-b hover:bg-neutral-50">
                {/* z-10: las celdas de nota llevan `relative` (para anclar el
                    popover), así que sin z-index explícito ganaban el orden de
                    pintado por ir después en el DOM y se deslizaban por encima
                    del nombre en móvil. */}
                <td className="p-2 sticky left-0 z-10 bg-white text-neutral-500">{i + 1}</td>
                <td className="p-2 sticky left-8 z-10 bg-white whitespace-nowrap">{s.nombre}</td>
                {columns.map((col, ci) => {
                  const value = s.subnotas[col.slotKeys[0]] ?? 0;
                  const observation = s.noteObservations?.[col.column] ?? '';
                  const isEv = col.cats.length === 1 && col.cats[0] === 'E';
                  return (
                    <NoteCell
                      key={col.column}
                      studentId={s.id!}
                      studentName={s.nombre}
                      column={col.column}
                      achievement={titleByColumn.get(col.column)}
                      slotKeys={col.slotKeys}
                      value={value}
                      observation={observation}
                      isEv={isEv}
                      row={i}
                      col={ci}
                      size={{ rows: activos.length, cols: columns.length }}
                      onPasteBlock={pegar}
                    />
                  );
                })}
                <td className={`p-2 text-center bg-neutral-50 ${defColor}`}>
                  {def.definitiva}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-2 space-y-1 text-xs text-neutral-500">
        <p className="flex items-center gap-3 flex-wrap">
          <span className={pendientes > 0 ? 'text-amber-700 font-medium' : 'text-green-700 font-medium'}>
            {pendientes > 0
              ? `${pendientes} nota${pendientes === 1 ? '' : 's'} sin calificar`
              : '✓ Planilla completa'}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-6 h-4 rounded border border-dashed border-amber-400 bg-amber-100" />
            sin calificar
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block w-6 h-4 rounded border border-red-400 bg-red-100" />
            &lt; {NOTA_APROBACION}
          </span>
          <span>Flechas para moverte · Enter baja · 📝 para observación</span>
          <span>Pega una columna del Excel sobre una casilla</span>
        </p>
        <p>
          {columns.length} columnas ({slots.length} slots internos) · {activos.length} activos ·
          Definitiva con algoritmo de la plataforma (ignore-zeros).
          <span className="ml-2 text-amber-800">
            ★ C7 (EV) es toda la categoría E — un cambio ahí mueve la DEF ~4 pts.
          </span>
        </p>
      </div>

      {pastePlan && (
        <PasteNotasPreview plan={pastePlan} onClose={() => setPastePlan(null)} />
      )}
    </div>
  );
}

/**
 * Celda con input de nota + botón de observación (popover con textarea).
 */
function NoteCell({
  studentId, studentName, column, achievement, slotKeys, value, observation, isEv,
  row, col, size, onPasteBlock,
}: {
  studentId: number;
  studentName: string;
  column: string;
  /** Nombre real del logro, si la plantilla ya se leyó. */
  achievement?: string;
  slotKeys: string[];
  value: number;
  observation: string;
  isEv: boolean;
  row: number;
  col: number;
  size: { rows: number; cols: number };
  /** Reparte lo pegado desde el Excel; true si se hizo cargo. */
  onPasteBlock: (texto: string, row: number, col: number) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(observation);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Lo escrito, aparte de lo guardado: mientras se escribe la casilla puede
  // quedar vacía. Con el valor guardado directo, borrar el contenido lo volvía
  // un 0 en el acto y había que escribir encima de él.
  const [texto, setTexto] = useState(String(value));

  /*
   * Guardar una nota vuelve a dibujar la tabla (la lee un live query), así que
   * este efecto corre en cada tecleo. Si pisara el texto mientras se escribe,
   * el cursor saltaría al final en cada dígito — por eso solo sincroniza
   * cuando la casilla NO tiene el foco, que es el caso que importa: un cambio
   * llegado del otro dispositivo.
   */
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setTexto(String(value));
  }, [value]);

  /** Saltar a otra casilla: se busca por su fila y columna, no por ref. */
  const irA = (destino: { row: number; col: number }) => {
    const el = document.querySelector<HTMLInputElement>(
      `[data-nota="${notaCellId(destino.row, destino.col)}"]`,
    );
    if (!el) return;
    el.focus();
    // Seleccionado: al llegar, escribir reemplaza en vez de pegarse a lo que
    // ya había (llegar a un 70 y teclear 8 daría 708).
    el.select();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const texto = e.clipboardData.getData('text/plain');
    if (!texto) return;
    // Solo se frena el pegado si de verdad hay varios valores que repartir;
    // si no, pegar dentro de la casilla es lo que se espera.
    if (onPasteBlock(texto, row, col)) e.preventDefault();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    // Con algo seleccionado no se está moviendo el cursor dentro del número,
    // así que izquierda y derecha pueden cambiar de columna.
    const sinSeleccion = el.selectionStart === el.selectionEnd;
    const destino = nextCell({ row, col }, {
      key: e.key,
      shiftKey: e.shiftKey,
      atStart: sinSeleccion && el.selectionStart === 0,
      atEnd: sinSeleccion && el.selectionStart === el.value.length,
    }, size);
    if (!destino) return;
    // Sin esto, arriba y abajo mandan el cursor a las puntas del texto.
    e.preventDefault();
    irA(destino);
  };

  // Cuando cambia la observación externa (por sync/pull), sincronizar el draft si el popover está cerrado
  useEffect(() => {
    if (!open) setDraft(observation);
  }, [observation, open]);

  // Cerrar popover al click afuera
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        commitAndClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  // Autofocus del textarea al abrir
  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  const commitAndClose = () => {
    if (draft !== observation) updateColumnObservation(studentId, column, draft);
    setOpen(false);
  };

  const isFailing = value > 0 && value < NOTA_APROBACION;
  // En el algoritmo de la plataforma (ignore-zeros) un 0 no cuenta: significa
  // "sin calificar", no "sacó cero". Por eso se marca como pendiente, no como
  // reprobado.
  const isPending = value === 0;

  const cellBg = isEv ? 'bg-amber-50 border-x-2 border-amber-400' : '';
  /*
   * `amber-100` y no `amber-50`: la celda de la columna EV ya viene en
   * `amber-50`, así que ese tono dejaba el input sin contraste de relleno justo
   * en la columna que más pesa. Con amber-100 se separa tanto del blanco de las
   * columnas normales como del ámbar de la EV.
   *
   * El borde punteado refuerza la lectura de "casilla vacía" y sobrevive
   * aunque el fondo cambie.
   */
  const inputColor = isFailing
    ? 'bg-red-100 border-red-400 text-red-900 font-semibold'
    : isPending
    ? 'bg-amber-100 border-amber-400 border-dashed text-amber-700'
    : isEv
    ? 'border-amber-500 font-semibold'
    : '';

  return (
    <td className={`p-1 text-center ${cellBg} relative`}>
      <div className="inline-flex items-center gap-0.5">
        {/*
          * `text` y no `number`: en un input numérico las flechas suben y
          * bajan el valor, que es justo lo que estorba calificando. De paso se
          * van las flechitas del spinner —que en 12px de ancho sobran— y deja
          * de cambiar la nota si la rueda del mouse pasa por encima.
          * `inputMode="numeric"` conserva el teclado de números en el celular.
          */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          data-nota={notaCellId(row, col)}
          value={texto}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={e => e.currentTarget.select()}
          onChange={e => {
            const limpio = sanitizeNota(e.target.value);
            setTexto(limpio);
            updateColumnValue(studentId, slotKeys, notaValue(limpio));
          }}
          // Se normaliza de lo escrito y no del valor guardado: ese llega por
          // el live query un instante después, así que salir de una casilla
          // recién cambiada mostraba la nota vieja por un parpadeo.
          onBlur={() => setTexto(String(notaValue(texto)))}
          aria-label={`${studentName} · ${column}`}
          className={`w-12 text-center border rounded p-1 ${inputColor}`}
        />
        <button
          type="button"
          // Fuera del recorrido del tabulador: si no, Tab alternaba nota,
          // botón, nota, y avanzar por la fila costaba el doble de teclazos.
          tabIndex={-1}
          onClick={() => setOpen(o => !o)}
          title={observation ? `Obs: ${observation}` : 'Añadir observación'}
          className={`text-[11px] leading-none px-0.5 hover:text-neutral-900 ${
            observation ? 'text-blue-700' : 'text-neutral-300'
          }`}
        >
          {observation ? '📝' : '＋'}
        </button>
      </div>

      {open && (
        <div
          ref={popoverRef}
          className="absolute z-30 top-full left-1/2 -translate-x-1/2 mt-1 w-64 bg-white border border-neutral-300 rounded-md shadow-lg p-2 text-left"
        >
          <div className="text-[10px] text-neutral-500 mb-1">
            <div className="flex items-baseline justify-between">
              <span className="truncate max-w-[130px]" title={studentName}>
                {studentName}
              </span>
              <span className="font-medium text-neutral-800 ml-2">
                {column} · {value || '–'}
              </span>
            </div>
            {achievement && (
              <div className="text-[10px] text-neutral-400 leading-tight mt-0.5" title={achievement}>
                {achievement}
              </div>
            )}
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') { setDraft(observation); setOpen(false); }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commitAndClose();
            }}
            rows={3}
            placeholder="Razón de la nota, contexto, feedback…"
            className="w-full text-xs border rounded p-1.5 resize-y min-h-[60px]"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-neutral-400">
              Ctrl+Enter guarda · Esc cancela
            </span>
            <div className="flex gap-2">
              {observation && (
                <button
                  type="button"
                  onClick={() => { setDraft(''); }}
                  className="text-[11px] text-red-600 hover:underline"
                >
                  Borrar
                </button>
              )}
              <button
                type="button"
                onClick={commitAndClose}
                className="text-[11px] px-2 py-0.5 rounded bg-neutral-900 text-white"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </td>
  );
}
