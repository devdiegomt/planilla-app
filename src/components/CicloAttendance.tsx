'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  updateAttendance,
  updateSessionAttendance,
  confirmAttendance,
  unconfirmAttendance,
  updateAttendanceObservation,
  toggleArrived,
  setSessionsInCiclo,
} from '@/lib/db';
import {
  cycleMarkState, sessionMarkState, nextMarkState,
  markLabel, markDescription,
  type MarkKind, type MarkState,
} from '@/lib/attendance';
import { computeDayTypes, todayIso } from '@/lib/schedule';
import { buildCycleContext, sessionDatesOf, currentCiclo } from '@/lib/cycles';
import {
  sessionsInCiclo, scheduledSessions, isOverridden, sessionAt,
} from '@/lib/sessions';
import { ExportAttendance } from './ExportAttendance';
import type { Course, Student } from '@/types';

interface Props {
  course: Course;
  initialCiclo?: number;
}

/**
 * Editor de F/R por ciclo.
 *
 * Si el ciclo trae UNA clase del curso: dos marcas F/R y un botón "Confirmar
 * ciclo N". Si trae DOS: cuatro marcas F1/R1/F2/R2 y un confirmar por sesión,
 * porque el colegio registra la asistencia de cada fecha por separado.
 *
 * Eso pasa siempre en 11° (ocupa dos tipos de día) y también en los cursos del
 * viernes cuando al ciclo le caen dos viernes — no se decide por el grado.
 *
 * Cada marca es un botón de tres estados (sin marca → injustificada →
 * justificada) en vez de un checkbox: Classroom Live distingue justificadas y
 * un checkbox no da para tres. Se mantiene un control por celda para no perder
 * densidad en cursos de 28 estudiantes.
 */
export function CicloAttendance({ course, initialCiclo }: Props) {
  const [ciclo, setCiclo] = useState(() => clamp(initialCiclo ?? 1, 1, 9));
  // Si la URL no fija ciclo, se salta al actual una sola vez, cuando el
  // contexto de ciclos ya se pudo calcular.
  const [autoAjustado, setAutoAjustado] = useState(initialCiclo != null);

  const yearCfg = useLiveQuery(() => db.yearConfig.where('year').equals(course.year).first(), [course.year]);
  const customDays = useLiveQuery(() => db.calendarDays.toArray(), []) ?? [];
  const schedule = useLiveQuery(() => db.schedule.toArray(), []) ?? [];

  /*
   * Cuántas clases tiene ESTE curso en ESTE ciclo. Antes se asumía "dos si es
   * 11°, una si no", pero un curso del viernes también puede tener dos cuando
   * al ciclo le caen dos viernes — y entonces el colegio registra la asistencia
   * de cada fecha por separado.
   */
  const ctx = useMemo(() => {
    if (!yearCfg || schedule.length === 0) return null;
    const seq = computeDayTypes(
      yearCfg.startDate, yearCfg.initialDayType, `${yearCfg.year}-12-31`, customDays, true,
    );
    return buildCycleContext(seq, schedule, [course], yearCfg);
  }, [yearCfg, schedule, customDays, course]);

  const sessionDates = useMemo(
    () => (ctx ? sessionDatesOf(ctx, course.code, ciclo) : []),
    [ctx, course.code, ciclo],
  );

  const cicloActual = useMemo(
    () => (ctx ? currentCiclo(ctx, course.code, todayIso()) : null),
    [ctx, course.code],
  );

  useEffect(() => {
    if (autoAjustado || cicloActual == null) return;
    setCiclo(clamp(cicloActual, 1, 9));
    setAutoAjustado(true);
  }, [autoAjustado, cicloActual]);

  /*
   * Cuántas veces se marca lista en este ciclo.
   *
   * El horario propone y el docente dispone. Antes salía solo del horario, y
   * eso dejaba dos juegos de casillas en cursos donde se llama a lista una vez
   * — y no daba forma de marcar tres o cuatro en las materias que ven al mismo
   * curso varias veces por ciclo.
   */
  const nSesiones = sessionsInCiclo(course, ciclo, sessionDates);
  const sesiones = useMemo(
    () => Array.from({ length: nSesiones }, (_, i) => i + 1),
    [nSesiones],
  );
  const porSesion = nSesiones > 1;
  const propuestas = scheduledSessions(sessionDates);
  const corregido = isOverridden(course, ciclo, sessionDates);

  const cambiarSesiones = (n: number) =>
    setSessionsInCiclo(course.id!, ciclo, n === propuestas ? null : n);

  useEffect(() => {
    if (initialCiclo != null) { setCiclo(clamp(initialCiclo, 1, 9)); setAutoAjustado(true); }
  }, [initialCiclo]);

  const students = useLiveQuery(
    () => db.students.where('courseId').equals(course.id!).sortBy('order'),
    [course.id],
  );
  const marks = useLiveQuery(
    () => db.attendanceMarks
      .where('[courseId+ciclo]').equals([course.id!, ciclo]).toArray(),
    [course.id, ciclo],
  ) ?? [];

  const activos: Student[] = useMemo(
    () => (students ?? []).filter(s => !s.withdrawnAt),
    [students],
  );

  const markCiclo = marks.find(m => m.session == null);

  const stats = useMemo(() => {
    let F = 0, Fj = 0, R = 0, Rj = 0, llegaron = 0;
    const porSes = sesiones.map(() => ({ F: 0, R: 0 }));
    for (const s of activos) {
      const c = s.cycles.find(x => x.ciclo === ciclo);
      if (!c) continue;
      if (c.F) { F++; if (c.Fj) Fj++; }
      if (c.R) { R++; if (c.Rj) Rj++; }
      let llegoAlguna = false;
      for (const n of sesiones) {
        const sd = sessionAt(c, n);
        if (!sd) continue;
        if (sd.F) porSes[n - 1].F++;
        if (sd.R) porSes[n - 1].R++;
        if (sd.arrived) llegoAlguna = true;
      }
      // Con varias sesiones basta una para "ya está en el salón".
      if (porSesion ? llegoAlguna : c.arrived) llegaron++;
    }
    return { F, Fj, R, Rj, porSes, llegaron };
  }, [activos, ciclo, porSesion, sesiones]);

  return (
    <div className="border rounded-lg overflow-hidden">
      <header className="px-4 py-3 bg-neutral-50 border-b flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium">Asistencia · Ciclo</span>
        <select
          value={ciclo}
          onChange={e => setCiclo(parseInt(e.target.value))}
          className="border rounded px-2 py-1 text-sm"
        >
          {Array.from({ length: 9 }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span className="text-xs text-neutral-500">
          {activos.length} activos
          {stats.llegaron > 0 && ` · ✅ ${stats.llegaron}/${activos.length} en el salón`}
          {porSesion
            ? ' · ' + stats.porSes
                .map((x, i) => `S${i + 1}: ${x.F}F/${x.R}R`).join(' · ')
            : ` · ${stats.F}F${stats.Fj ? ` (${stats.Fj}j)` : ''}`
              + ` · ${stats.R}R${stats.Rj ? ` (${stats.Rj}j)` : ''}`}
        </span>

        <SessionsControl
          n={nSesiones}
          propuestas={propuestas}
          corregido={corregido}
          fechas={sessionDates}
          onChange={cambiarSesiones}
        />
        <div className="ml-auto flex items-start gap-3 flex-wrap justify-end">
          {porSesion ? (
            sesiones.map(n => (
              <div key={n} className="flex items-start gap-2">
                <ConfirmButton
                  label={`S${n}`} mark={marks.find(m => m.session === n)}
                  onConfirm={() => confirmAttendance(course.id!, ciclo, n)}
                  onUndo={() => unconfirmAttendance(course.id!, ciclo, n)}
                />
                <ExportAttendance
                  course={course} students={activos} ciclo={ciclo} session={n}
                />
              </div>
            ))
          ) : (
            <>
              <ConfirmButton
                label={`ciclo ${ciclo}`} mark={markCiclo}
                onConfirm={() => confirmAttendance(course.id!, ciclo)}
                onUndo={() => unconfirmAttendance(course.id!, ciclo)}
              />
              <ExportAttendance course={course} students={activos} ciclo={ciclo} />
            </>
          )}
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-white border-b text-neutral-500">
            <tr>
              <th className="p-2 text-left w-8">#</th>
              <th className="p-2 text-left">Estudiante</th>
              {porSesion ? (
                sesiones.flatMap(n => [
                  <th key={`F${n}`} className="p-2 text-center w-14">F{n}</th>,
                  <th key={`R${n}`} className="p-2 text-center w-14">R{n}</th>,
                ])
              ) : (
                <>
                  <th className="p-2 text-center w-16">F</th>
                  <th className="p-2 text-center w-16">R</th>
                </>
              )}
              <th className="p-2 text-center w-10" title="Ya llegó al salón (no se exporta)">
                ✅
              </th>
              <th className="p-2 text-center w-10" title="Razón de la falla o el retardo">
                Razón
              </th>
            </tr>
          </thead>
          <tbody>
            {activos.map((s, i) => {
              const c = s.cycles.find(x => x.ciclo === ciclo);
              return (
                <tr key={s.id} className="border-b hover:bg-neutral-50">
                  <td className="p-2 text-neutral-400">{i + 1}</td>
                  <td className="p-2 whitespace-nowrap">{s.nombre}</td>
                  {porSesion ? (
                    sesiones.flatMap(sess =>
                      (['F', 'R'] as const).map(kind => (
                        <MarkCell
                          key={`${sess}${kind}`}
                          kind={kind}
                          state={sessionMarkState(sessionAt(c, sess), kind)}
                          onCycle={next => updateSessionAttendance(s.id!, ciclo, sess, kind, next)}
                          student={s.nombre}
                        />
                      )),
                    )
                  ) : (
                    (['F', 'R'] as const).map(kind => (
                      <MarkCell
                        key={kind}
                        kind={kind}
                        state={cycleMarkState(c, kind)}
                        onCycle={next => updateAttendance(s.id!, ciclo, kind, next)}
                        student={s.nombre}
                      />
                    ))
                  )}
                  <ArrivedCell
                    student={s.nombre}
                    porSesion={porSesion}
                    arrived={porSesion
                      ? sesiones.map(n => !!sessionAt(c, n)?.arrived)
                      : [!!c?.arrived]}
                    onToggle={(sess, v) => toggleArrived(s.id!, ciclo, sess, v)}
                  />
                  <ReasonCell
                    student={s.nombre}
                    ciclo={ciclo}
                    porSesion={porSesion}
                    obsCiclo={c?.obs ?? ''}
                    obsSesiones={sesiones.map(n => sessionAt(c, n)?.obs ?? '')}
                    onSave={(sess, texto) =>
                      updateAttendanceObservation(s.id!, ciclo, sess, texto)}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t bg-neutral-50 flex items-center gap-3 flex-wrap text-[11px] text-neutral-600">
        <span>Click para ciclar:</span>
        <LegendChip cls="bg-white border-neutral-200 text-neutral-300" label="·" text="sin marca" />
        <LegendChip cls="bg-red-600 border-red-600 text-white" label="F" text="falla injustificada" />
        <LegendChip cls="bg-red-50 border-red-400 text-red-700" label="FJ" text="falla justificada" />
        <LegendChip cls="bg-amber-500 border-amber-500 text-white" label="R" text="retardo injustificado" />
        <LegendChip cls="bg-amber-50 border-amber-400 text-amber-700" label="RJ" text="retardo justificado" />
      </div>
    </div>
  );
}

function LegendChip({ cls, label, text }: { cls: string; label: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center justify-center w-7 h-5 rounded border text-[10px] font-semibold ${cls}`}>
        {label}
      </span>
      {text}
    </span>
  );
}

/** 'vie 6 mar' — para ver de qué clase es cada sesión. */
function fechaCorta(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-CO', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

/**
 * Cuántas veces se marca lista en este ciclo.
 *
 * El horario propone y el docente dispone. Por eso el control dice qué propone
 * el horario y con qué fechas: si a un curso le salen dos clases y solo ves al
 * grupo una vez, las fechas muestran de dónde salió la segunda — casi siempre
 * un bloque de más en el horario.
 */
function SessionsControl({
  n, propuestas, corregido, fechas, onChange,
}: {
  n: number;
  propuestas: number;
  corregido: boolean;
  fechas: string[];
  onChange: (n: number) => void | Promise<unknown>;
}) {
  const detalle = fechas.length > 0
    ? `El horario dice ${propuestas} clase(s) en este ciclo: ${fechas.map(fechaCorta).join(' y ')}.`
    : 'El horario no tiene clases de este curso en el ciclo.';

  return (
    <span className="inline-flex items-center gap-1 text-xs text-neutral-600">
      {n === 1 ? (
        <button
          type="button"
          onClick={() => onChange(2)}
          title={detalle}
          className="px-2 py-1 rounded border hover:bg-white"
        >
          ¿Se repite el ciclo?
        </button>
      ) : (
        <>
          <span title={detalle}>{n} clases</span>
          <button
            type="button"
            onClick={() => onChange(n - 1)}
            aria-label="Quitar una clase de este ciclo"
            className="w-6 h-6 rounded border hover:bg-white leading-none"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => onChange(n + 1)}
            aria-label="Añadir otra clase a este ciclo"
            className="w-6 h-6 rounded border hover:bg-white leading-none"
          >
            +
          </button>
        </>
      )}
      {corregido && (
        <button
          type="button"
          onClick={() => onChange(propuestas)}
          title={detalle}
          className="text-[11px] text-neutral-400 underline decoration-dotted hover:text-neutral-700"
        >
          según el horario
        </button>
      )}
    </span>
  );
}

/**
 * "Ya llegó": chequeo en vivo para ver quién falta por entrar.
 *
 * No se exporta y no toca F/R a propósito. Son cosas distintas: al empezar la
 * clase nadie está marcado como llegado, y eso no quiere decir que todos hayan
 * faltado. Marcar la llegada es lo que haces mientras entran; la falla es lo
 * que registras al final.
 */
function ArrivedCell({
  student, porSesion, arrived, onToggle,
}: {
  student: string;
  porSesion: boolean;
  /** Una por sesión, o una sola si el ciclo se marca de una vez. */
  arrived: boolean[];
  onToggle: (session: number | null, value: boolean) => void | Promise<unknown>;
}) {
  const boton = (idx: number, sess: number | null) => {
    const on = arrived[idx];
    return (
      <button
        key={idx}
        type="button"
        onClick={() => onToggle(sess, !on)}
        aria-pressed={on}
        aria-label={`${student}${sess ? ` sesión ${sess}` : ''} · ${on ? 'ya llegó' : 'sin marcar'}`}
        title={on ? 'Ya llegó — click para desmarcar' : 'Marcar que ya llegó'}
        className={`w-7 h-7 rounded border text-[13px] leading-none transition-colors ${
          on
            ? 'bg-green-50 border-green-400'
            : 'bg-white border-neutral-200 text-transparent hover:border-neutral-400'
        }`}
      >
        ✅
      </button>
    );
  };
  return (
    <td className="p-1 text-center">
      <div className="inline-flex gap-0.5">
        {porSesion ? arrived.map((_, i) => boton(i, i + 1)) : boton(0, null)}
      </div>
    </td>
  );
}

/**
 * Razón de la falla o el retardo, en un popover.
 *
 * Sirve tanto para dejar el motivo ("cita médica", "se fue a enfermería") como
 * para anotar en vivo lo que todavía no se resuelve ("aún no llega"). Cuando el
 * ciclo trae dos clases se piden por separado: son días distintos.
 */
function ReasonCell({
  student, ciclo, porSesion, obsCiclo, obsSesiones, onSave,
}: {
  student: string;
  ciclo: number;
  porSesion: boolean;
  obsCiclo: string;
  /** Una razón por sesión, en orden. */
  obsSesiones: string[];
  onSave: (session: number | null, texto: string) => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [d0, setD0] = useState(obsCiclo);
  const [ds, setDs] = useState<string[]>(obsSesiones);
  const ref = useRef<HTMLTableCellElement | null>(null);

  const hay = porSesion ? obsSesiones.some(Boolean) : !!obsCiclo;
  const resumen = porSesion
    ? obsSesiones.map((o, i) => o && `S${i + 1}: ${o}`).filter(Boolean).join('\n')
    : obsCiclo;

  // Sincronizar los borradores cuando cambia el dato externo (sync, otro ciclo).
  // `join` en las dependencias: el arreglo se recrea en cada render y como
  // dependencia dispararía el efecto siempre, pisando lo que se esté
  // escribiendo.
  const externas = obsSesiones.join('\u0000');
  useEffect(() => {
    if (!open) { setD0(obsCiclo); setDs(externas.split('\u0000')); }
  }, [open, obsCiclo, externas]);

  /*
   * Las sesiones se guardan EN SERIE, no en paralelo. Cada escritura hace un
   * lee-muta-escribe sobre la misma fila del estudiante: dispararlas juntas
   * hacía que la segunda leyera antes de que la primera hubiera guardado, y la
   * razón de la primera se perdía en silencio.
   */
  const guardarYCerrar = async () => {
    setOpen(false);
    if (porSesion) {
      for (let i = 0; i < ds.length; i++) {
        if (ds[i] !== (obsSesiones[i] ?? '')) await onSave(i + 1, ds[i]);
      }
    } else if (d0 !== obsCiclo) {
      await onSave(null, d0);
    }
  };

  const cancelar = () => {
    setD0(obsCiclo);
    setDs(externas.split('\u0000'));
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const fuera = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) guardarYCerrar();
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, d0, ds]);

  const campo = (label: string, val: string, set: (v: string) => void) => (
    <label className="block" key={label}>
      {porSesion && <span className="text-[10px] text-neutral-500">{label}</span>}
      <textarea
        value={val}
        onChange={e => set(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') cancelar();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardarYCerrar();
        }}
        rows={2}
        placeholder="Aún no llega, cita médica, se fue a enfermería…"
        className="w-full text-xs border rounded p-1.5 resize-y min-h-[44px]"
      />
    </label>
  );

  return (
    <td className="p-1 text-center relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Razón · ${student}`}
        title={hay ? resumen : 'Anotar razón'}
        className={`text-[11px] leading-none px-1 py-1 rounded hover:bg-neutral-100 ${
          hay ? 'text-blue-700' : 'text-neutral-300'
        }`}
      >
        {hay ? '💬' : '＋'}
      </button>

      {open && (
        <div className="absolute z-30 top-full right-0 mt-1 w-60 bg-white border border-neutral-300
                        rounded-md shadow-lg p-2 text-left space-y-1.5">
          <div className="text-[10px] text-neutral-500 flex justify-between">
            <span className="truncate max-w-[150px]" title={student}>{student}</span>
            <span className="font-medium text-neutral-800">Ciclo {ciclo}</span>
          </div>
          {porSesion ? (
            ds.map((val, i) =>
              campo(`Sesión ${i + 1}`, val, v =>
                setDs(prev => prev.map((x, j) => (j === i ? v : x)))))
          ) : (
            campo('', d0, setD0)
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-neutral-400">Ctrl+Enter guarda</span>
            <button
              type="button"
              onClick={guardarYCerrar}
              className="text-[11px] px-2 py-0.5 rounded bg-neutral-900 text-white"
            >
              Guardar
            </button>
          </div>
        </div>
      )}
    </td>
  );
}

/**
 * Marca de asistencia de tres estados. El relleno sólido señala injustificada
 * (lo que cuenta en contra) y el contorno, justificada — así se distingue la
 * gravedad de un vistazo sin leer la etiqueta.
 */
function MarkCell({
  kind, state, onCycle, student,
}: {
  kind: MarkKind;
  state: MarkState;
  onCycle: (next: MarkState) => void | Promise<unknown>;
  student: string;
}) {
  const palette: Record<MarkState, string> = kind === 'F'
    ? {
        none: 'bg-white border-neutral-200 text-neutral-300 hover:border-neutral-400',
        injustificada: 'bg-red-600 border-red-600 text-white',
        justificada: 'bg-red-50 border-red-400 text-red-700',
      }
    : {
        none: 'bg-white border-neutral-200 text-neutral-300 hover:border-neutral-400',
        injustificada: 'bg-amber-500 border-amber-500 text-white',
        justificada: 'bg-amber-50 border-amber-400 text-amber-700',
      };

  return (
    <td className="p-1 text-center">
      <button
        type="button"
        onClick={() => onCycle(nextMarkState(state))}
        aria-label={`${student} · ${markDescription(kind, state)}`}
        title={`${markDescription(kind, state)} — click para cambiar`}
        className={`w-9 h-7 rounded border text-[11px] font-semibold tabular-nums
                    transition-colors ${palette[state]}`}
      >
        {markLabel(kind, state)}
      </button>
    </td>
  );
}

function ConfirmButton({
  label, mark, onConfirm, onUndo,
}: {
  label: string;
  mark: { confirmedAt: string } | undefined;
  onConfirm: () => void | Promise<unknown>;
  onUndo: () => void | Promise<unknown>;
}) {
  if (mark) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-xs text-green-700 font-medium">
          ✓ {label} · {new Date(mark.confirmedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
        <button
          onClick={() => onUndo()}
          className="text-xs text-neutral-600 hover:text-neutral-900 underline"
        >
          desmarcar
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => onConfirm()}
      className="px-3 py-1 rounded-md bg-neutral-900 text-white text-xs font-medium"
    >
      Confirmar {label}
    </button>
  );
}

function clamp(x: number, lo: number, hi: number) {
  return Math.min(Math.max(x, lo), hi);
}
