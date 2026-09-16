'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { gradesOf, sortCourses } from '@/lib/courseOrder';

export function CoursesList() {
  const courses = useLiveQuery(() => db.courses.toArray());
  if (!courses) return <p className="text-sm text-neutral-500">Cargando...</p>;
  if (courses.length === 0) {
    return <p className="text-sm text-neutral-500">Sube tu Planilla para empezar.</p>;
  }

  // Agrupar por grado, en el orden del colegio (el código ya trae el grado).
  const byGrade: Record<number, typeof courses> = {};
  for (const c of sortCourses(courses)) {
    (byGrade[c.grade] ??= [] as typeof courses).push(c);
  }

  return (
    <div className="space-y-4">
      {gradesOf(courses).map(grade => {
        const list = byGrade[grade];
        if (!list?.length) return null;
        return (
          <div key={grade}>
            <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Grado {grade}°</h3>
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {list.map(c => (
                <li key={c.code}>
                  <Link
                    href={`/curso/${c.code}`}
                    className="block rounded-md border p-3 hover:bg-neutral-50"
                  >
                    <div className="font-medium">{c.code}</div>
                    <div className="text-xs text-neutral-500 truncate">{c.director}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
