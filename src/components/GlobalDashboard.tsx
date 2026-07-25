'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { computeCourseStats } from '@/lib/stats';
import { CURSOS_ORDER } from '@/lib/constants';
import type { Course, Student } from '@/types';

interface CourseCard {
  course: Course;
  activos: number;
  aprobandoPct: number;
  expertoPct: number;
  promedio: number;
  enRiesgo: number;
  reprobando: number;
}

export function GlobalDashboard() {
  const courses = useLiveQuery(() => db.courses.toArray()) ?? [];
  const students = useLiveQuery(() => db.students.toArray()) ?? [];

  const cards: CourseCard[] = useMemo(() => {
    const byCourse = new Map<number, Student[]>();
    for (const s of students) {
      const arr = byCourse.get(s.courseId);
      if (arr) arr.push(s); else byCourse.set(s.courseId, [s]);
    }
    return courses.map(c => {
      const stats = computeCourseStats(byCourse.get(c.id!) ?? [], c.grade);
      return {
        course: c,
        activos: stats.activos,
        aprobandoPct: stats.aprobandoPct,
        expertoPct: stats.expertoPct,
        promedio: stats.promedio,
        enRiesgo: stats.enRiesgo.length,
        reprobando: stats.reprobados.length,
      };
    });
  }, [courses, students]);

  const alerts = cards.filter(c => c.aprobandoPct < 70 || c.reprobando >= 3);
  const byGrade = groupByGrade(cards);

  if (courses.length === 0) {
    return <p className="text-sm text-neutral-500">Sube tu Planilla para empezar.</p>;
  }

  return (
    <div className="space-y-4">
      {alerts.length > 0 && (
        <div className="border-l-4 border-red-500 bg-red-50 rounded-r-md px-4 py-3 text-sm">
          <div className="font-medium text-red-900 mb-1">
            {alerts.length} curso{alerts.length > 1 ? 's' : ''} necesita{alerts.length === 1 ? '' : 'n'} atención
          </div>
          <div className="flex gap-2 flex-wrap">
            {alerts.map(a => (
              <Link
                key={a.course.code}
                href={`/curso/${a.course.code}`}
                className="text-xs bg-white border border-red-300 rounded px-2 py-1 hover:bg-red-100 text-red-900"
              >
                {a.course.code} · {a.aprobandoPct}% aprob
                {a.reprobando >= 3 && ` · ${a.reprobando} rep`}
              </Link>
            ))}
          </div>
        </div>
      )}

      {[8, 9, 10, 11].map(grade => {
        const list = byGrade[grade];
        if (!list?.length) return null;
        return (
          <div key={grade}>
            <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
              Grado {grade}° · {list.length} cursos · {list.reduce((a, b) => a + b.activos, 0)} activos
            </h3>
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {list.map(c => <CourseTile key={c.course.code} card={c} />)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function CourseTile({ card }: { card: CourseCard }) {
  const c = card.course;
  const tone =
    card.aprobandoPct >= 90 ? 'bg-green-50 border-green-200' :
    card.aprobandoPct >= 75 ? 'bg-white border-neutral-200' :
    card.aprobandoPct >= 60 ? 'bg-amber-50 border-amber-200' :
                              'bg-red-50 border-red-200';
  const pctColor =
    card.aprobandoPct >= 90 ? 'text-green-700' :
    card.aprobandoPct >= 75 ? 'text-neutral-800' :
    card.aprobandoPct >= 60 ? 'text-amber-700' :
                              'text-red-700';

  return (
    <li>
      <Link
        href={`/curso/${c.code}`}
        className={`block rounded-md border p-2.5 hover:shadow-sm transition-shadow ${tone}`}
      >
        <div className="flex items-baseline justify-between">
          <div className="font-medium">{c.code}</div>
          <div className="text-[10px] text-neutral-500 tabular-nums">
            {card.activos}
          </div>
        </div>
        <div className="text-[10px] text-neutral-500 truncate mb-1.5" title={c.director}>
          {c.director}
        </div>
        <div className="flex items-baseline justify-between text-xs">
          <span className={`font-semibold tabular-nums ${pctColor}`}>
            {card.aprobandoPct}%
          </span>
          <span className="text-[10px] text-neutral-500 tabular-nums">
            {card.promedio} · {card.expertoPct}% ≥80
          </span>
        </div>
        {(card.reprobando > 0 || card.enRiesgo > 0) && (
          <div className="text-[10px] mt-1 flex gap-2">
            {card.reprobando > 0 && (
              <span className="text-red-700">{card.reprobando} rep</span>
            )}
            {card.enRiesgo > 0 && (
              <span className="text-amber-700">{card.enRiesgo} riesgo</span>
            )}
          </div>
        )}
      </Link>
    </li>
  );
}

function groupByGrade(cards: CourseCard[]): Record<number, CourseCard[]> {
  const by: Record<number, CourseCard[]> = {};
  for (const c of cards) {
    (by[c.course.grade] ??= []).push(c);
  }
  for (const g of Object.keys(by).map(Number)) {
    by[g].sort((a, b) =>
      CURSOS_ORDER.indexOf(parseInt(a.course.code))
      - CURSOS_ORDER.indexOf(parseInt(b.course.code))
    );
  }
  return by;
}
