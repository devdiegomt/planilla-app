'use client';

import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { computeCourseStats, computeAttendanceStats, type StudentDef } from '@/lib/stats';
import { NOTA_APROBACION, NOTA_EXPERTO } from '@/lib/constants';
import type { Course } from '@/types';

interface Props {
  course: Course;
}

export function CourseDashboard({ course }: Props) {
  const students = useLiveQuery(
    () => db.students.where('courseId').equals(course.id!).toArray(),
    [course.id],
  ) ?? [];
  const marks = useLiveQuery(
    () => db.attendanceMarks.where('courseId').equals(course.id!).toArray(),
    [course.id],
  ) ?? [];

  const stats = useMemo(() => computeCourseStats(students, course.grade), [students, course.grade]);
  const att = useMemo(
    () => computeAttendanceStats(students, marks, course.id!),
    [students, marks, course.id],
  );

  if (stats.activos === 0) {
    return (
      <div className="border rounded-lg p-4 text-sm text-neutral-500">
        Sin estudiantes activos en este curso.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Activos"     value={stats.activos} />
        <StatCard label="DEF promedio" value={stats.promedio}
                  hint={`mediana ${stats.mediana}`} />
        <StatCard label="Aprobando"   value={`${stats.aprobandoPct}%`}
                  hint={`${stats.aprobando}/${stats.activos} ≥${NOTA_APROBACION}`}
                  tone={stats.aprobandoPct >= 80 ? 'good' : stats.aprobandoPct >= 60 ? 'warn' : 'bad'} />
        <StatCard label="Experto"     value={`${stats.expertoPct}%`}
                  hint={`${stats.experto} con DEF ≥${NOTA_EXPERTO}`}
                  tone={stats.expertoPct >= 30 ? 'good' : 'neutral'} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Distribución">
          <Distribution d={stats.distribution} total={stats.activos} />
        </Card>

        <Card title="Promedios por categoría">
          <ul className="text-sm space-y-1">
            {(['K', 'M', 'U', 'C', 'E'] as const).map(cat => (
              <li key={cat} className="flex items-center gap-2">
                <span className="w-4 text-xs text-neutral-500">{cat}</span>
                <div className="flex-1 h-2 bg-neutral-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-neutral-800"
                    style={{ width: `${stats.categoryAverages[cat]}%` }}
                  />
                </div>
                <span className="tabular-nums w-8 text-right">
                  {stats.categoryAverages[cat]}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StudentList
          title="En riesgo"
          hint={`DEF ${NOTA_APROBACION}-75`}
          items={stats.enRiesgo}
          emptyMsg="Sin estudiantes en riesgo."
          tone="warn"
        />
        <StudentList
          title="Reprobando"
          hint="DEF < 70"
          items={stats.reprobados}
          emptyMsg="Sin reprobados."
          tone="bad"
        />
        <StudentList
          title="Salón de honor"
          hint={`DEF ≥ ${NOTA_EXPERTO}`}
          items={stats.expertos}
          emptyMsg="Aún no hay expertos."
          tone="good"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Asistencia del trimestre">
          <div className="text-sm space-y-1">
            <div>
              <span className="text-neutral-500">Ciclos confirmados: </span>
              <span className="font-medium">{att.ciclosConfirmados}/9</span>
            </div>
            <div>
              <span className="text-neutral-500">Total F: </span>
              <span className="font-medium">{att.totalFallas}</span>
              {att.totalFallasJust > 0 && (
                <span className="text-neutral-500"> ({att.totalFallasJust} just.)</span>
              )}
              <span className="text-neutral-500 mx-2">·</span>
              <span className="text-neutral-500">Total R: </span>
              <span className="font-medium">{att.totalRetardos}</span>
              {att.totalRetardosJust > 0 && (
                <span className="text-neutral-500"> ({att.totalRetardosJust} just.)</span>
              )}
            </div>
            {att.ultimaConfirmacion && (
              <div className="text-xs text-neutral-500">
                Última confirmación:{' '}
                {new Date(att.ultimaConfirmacion).toLocaleString('es-CO', {
                  dateStyle: 'short', timeStyle: 'short',
                })}
              </div>
            )}
          </div>
        </Card>

        <Card title="Top fallas/retardos">
          {att.topFallas.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin fallas ni retardos injustificados.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {att.topFallas.map(t => (
                <li key={t.nombre} className="flex justify-between gap-2">
                  <span className="truncate">{t.nombre}</span>
                  <span
                    className="text-xs tabular-nums shrink-0"
                    title="Injustificadas (entre paréntesis, las justificadas)"
                  >
                    <span className="text-red-700 font-medium">{t.F - t.Fj}F</span>
                    <span className="text-neutral-400"> · </span>
                    <span className="text-amber-700 font-medium">{t.R - t.Rj}R</span>
                    {(t.Fj > 0 || t.Rj > 0) && (
                      <span className="text-neutral-400"> (+{t.Fj + t.Rj}j)</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---- primitives ----

function StatCard({
  label, value, hint, tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  const toneCls =
    tone === 'good' ? 'text-green-700' :
    tone === 'warn' ? 'text-amber-700' :
    tone === 'bad'  ? 'text-red-700' :
                      'text-neutral-900';
  return (
    <div className="border rounded-lg p-3 bg-white">
      <div className="text-xs text-neutral-500 uppercase">{label}</div>
      <div className={`text-2xl font-semibold ${toneCls}`}>{value}</div>
      {hint && <div className="text-[11px] text-neutral-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-4 bg-white">
      <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Distribution({
  d, total,
}: {
  d: { min30_59: number; r60_69: number; r70_79: number; r80_89: number; r90_100: number };
  total: number;
}) {
  const rows: { label: string; count: number; color: string }[] = [
    { label: '30–59', count: d.min30_59, color: 'bg-red-500' },
    { label: '60–69', count: d.r60_69,   color: 'bg-amber-500' },
    { label: '70–79', count: d.r70_79,   color: 'bg-blue-500' },
    { label: '80–89', count: d.r80_89,   color: 'bg-green-500' },
    { label: '90–100', count: d.r90_100, color: 'bg-green-700' },
  ];
  return (
    <ul className="text-sm space-y-1.5">
      {rows.map(r => {
        const pct = total ? (r.count / total) * 100 : 0;
        return (
          <li key={r.label} className="flex items-center gap-2">
            <span className="text-xs text-neutral-500 w-12">{r.label}</span>
            <div className="flex-1 h-3 bg-neutral-100 rounded overflow-hidden">
              <div className={`h-full ${r.color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs tabular-nums text-neutral-600 w-6 text-right">
              {r.count}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function StudentList({
  title, hint, items, emptyMsg, tone,
}: {
  title: string;
  hint: string;
  items: StudentDef[];
  emptyMsg: string;
  tone: 'good' | 'warn' | 'bad';
}) {
  const badgeCls =
    tone === 'good' ? 'text-green-700' :
    tone === 'warn' ? 'text-amber-700' :
                      'text-red-700';
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wide text-neutral-500">{title}</h3>
        <span className="text-[10px] text-neutral-400">{hint}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">{emptyMsg}</p>
      ) : (
        <ul className="text-sm divide-y divide-neutral-100">
          {items.slice(0, 8).map(it => (
            <li key={it.student.id} className="flex justify-between py-1">
              <span className="truncate pr-2">{it.student.nombre}</span>
              <span className={`text-xs font-medium tabular-nums ${badgeCls}`}>
                {it.def}
              </span>
            </li>
          ))}
          {items.length > 8 && (
            <li className="text-[11px] text-neutral-500 pt-1">
              +{items.length - 8} más
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
