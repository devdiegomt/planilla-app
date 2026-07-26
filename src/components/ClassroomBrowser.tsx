'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ClassroomCourse, CourseWork, StudentSubmission, Attachment,
} from '@/lib/classroomApi';

interface MeResponse {
  connected: boolean;
  profile?: { name?: { fullName?: string }; emailAddress?: string; photoUrl?: string };
  error?: string;
}

interface SubmissionWithName extends StudentSubmission {
  studentName?: string;
}

export function ClassroomBrowser({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = use(searchParams);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [courses, setCourses] = useState<ClassroomCourse[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<ClassroomCourse | null>(null);

  const [coursework, setCoursework] = useState<CourseWork[]>([]);
  const [loadingCw, setLoadingCw] = useState(false);
  const [selectedCw, setSelectedCw] = useState<CourseWork | null>(null);

  const [submissions, setSubmissions] = useState<SubmissionWithName[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);

  const [err, setErr] = useState<string | null>(params.error ?? null);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/classroom/me');
      const data = await r.json() as MeResponse;
      setMe(data);
      setLoadingMe(false);
      if (data.connected) {
        const cr = await fetch('/api/classroom/courses');
        const cd = await cr.json();
        if (cr.ok) setCourses(cd.courses ?? []);
        else setErr(cd.error ?? 'Error cargando cursos');
      }
    })();
  }, []);

  const openCourse = useCallback(async (c: ClassroomCourse) => {
    setSelectedCourse(c);
    setSelectedCw(null);
    setSubmissions([]);
    setLoadingCw(true);
    setErr(null);
    try {
      const r = await fetch(`/api/classroom/courses/${c.id}/coursework`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error');
      setCoursework(d.coursework ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoadingCw(false); }
  }, []);

  const openCoursework = useCallback(async (cw: CourseWork) => {
    if (!selectedCourse) return;
    setSelectedCw(cw);
    setLoadingSubs(true);
    setErr(null);
    try {
      const r = await fetch(`/api/classroom/courses/${selectedCourse.id}/coursework/${cw.id}/submissions`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error');
      setSubmissions(d.submissions ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoadingSubs(false); }
  }, [selectedCourse]);

  const logout = async () => {
    await fetch('/api/classroom/logout', { method: 'POST' });
    setMe({ connected: false });
    setCourses([]); setSelectedCourse(null); setCoursework([]);
    setSelectedCw(null); setSubmissions([]);
  };

  if (loadingMe) return <p className="text-sm text-neutral-500">Cargando…</p>;

  if (!me?.connected) {
    return (
      <div className="border rounded-lg p-6 bg-neutral-50 space-y-3">
        <p className="text-sm text-neutral-700">
          No has conectado tu cuenta de Google. Al aceptar, autorizas <strong>solo lectura</strong> de tus
          cursos, tareas y entregas de estudiantes.
        </p>
        <a
          href="/api/classroom/login"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-neutral-900 text-white text-sm"
        >
          Conectar Google Classroom
        </a>
        {err && <p className="text-sm text-red-600">❌ {err}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm border rounded-lg px-3 py-2 bg-neutral-50">
        {me.profile?.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.profile.photoUrl} alt="" className="w-6 h-6 rounded-full" />
        )}
        <span className="font-medium">{me.profile?.name?.fullName ?? 'Conectado'}</span>
        <span className="text-neutral-500 text-xs">{me.profile?.emailAddress ?? ''}</span>
        <button
          onClick={logout}
          className="ml-auto text-xs text-neutral-600 hover:text-neutral-900 underline"
        >
          Desconectar
        </button>
      </div>

      {err && <p className="text-sm text-red-600">❌ {err}</p>}

      <div className="grid gap-4 md:grid-cols-3">
        <Panel title={`Cursos (${courses.length})`}>
          {courses.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin cursos activos.</p>
          ) : (
            <ul className="space-y-1">
              {courses.map(c => (
                <li key={c.id}>
                  <button
                    onClick={() => openCourse(c)}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-neutral-100 ${
                      selectedCourse?.id === c.id ? 'bg-neutral-100 font-medium' : ''
                    }`}
                  >
                    <div>{c.name}</div>
                    {c.section && (
                      <div className="text-[11px] text-neutral-500">{c.section}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={selectedCourse ? `Tareas de ${selectedCourse.name}` : 'Tareas'}>
          {!selectedCourse ? (
            <p className="text-sm text-neutral-500">Elige un curso.</p>
          ) : loadingCw ? (
            <p className="text-sm text-neutral-500">Cargando…</p>
          ) : coursework.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin tareas.</p>
          ) : (
            <ul className="space-y-1 max-h-[70vh] overflow-y-auto">
              {coursework.map(cw => {
                const due = cw.dueDate
                  ? `${cw.dueDate.year}-${String(cw.dueDate.month).padStart(2, '0')}-${String(cw.dueDate.day).padStart(2, '0')}`
                  : null;
                return (
                  <li key={cw.id}>
                    <button
                      onClick={() => openCoursework(cw)}
                      className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-neutral-100 ${
                        selectedCw?.id === cw.id ? 'bg-neutral-100 font-medium' : ''
                      }`}
                    >
                      <div>{cw.title}</div>
                      <div className="text-[11px] text-neutral-500 flex gap-2">
                        <span>{cw.workType ?? 'ASSIGNMENT'}</span>
                        {cw.state === 'DRAFT' && <span>· borrador</span>}
                        {due && <span>· vence {due}</span>}
                        {cw.maxPoints != null && <span>· {cw.maxPoints} pts</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title={selectedCw ? `Entregas de "${selectedCw.title}"` : 'Entregas'}>
          {!selectedCw ? (
            <p className="text-sm text-neutral-500">Elige una tarea.</p>
          ) : loadingSubs ? (
            <p className="text-sm text-neutral-500">Cargando…</p>
          ) : submissions.length === 0 ? (
            <p className="text-sm text-neutral-500">Sin entregas registradas.</p>
          ) : (
            <SubmissionsList
              submissions={submissions}
              maxPoints={selectedCw.maxPoints}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg bg-white">
      <h3 className="px-3 py-2 text-xs uppercase tracking-wide text-neutral-500 border-b">
        {title}
      </h3>
      <div className="p-2">{children}</div>
    </div>
  );
}

function SubmissionsList({
  submissions, maxPoints,
}: {
  submissions: SubmissionWithName[];
  maxPoints?: number;
}) {
  const sorted = useMemo(
    () => [...submissions].sort((a, b) => (a.studentName ?? '').localeCompare(b.studentName ?? '', 'es')),
    [submissions],
  );
  const summary = useMemo(() => {
    const total = submissions.length;
    const turnedIn = submissions.filter(s => s.state === 'TURNED_IN' || s.state === 'RETURNED').length;
    const late = submissions.filter(s => s.late).length;
    const graded = submissions.filter(s => s.assignedGrade != null).length;
    return { total, turnedIn, late, graded };
  }, [submissions]);

  return (
    <div className="space-y-2">
      <div className="text-xs text-neutral-500 px-1 flex gap-3 flex-wrap">
        <span>{summary.turnedIn}/{summary.total} entregadas</span>
        {summary.late > 0 && <span className="text-amber-700">{summary.late} tarde</span>}
        {summary.graded > 0 && <span>{summary.graded} calificadas</span>}
      </div>
      <ul className="space-y-1 max-h-[70vh] overflow-y-auto">
        {sorted.map(s => (
          <SubmissionRow
            key={s.id}
            submission={s}
            maxPoints={maxPoints}
          />
        ))}
      </ul>
    </div>
  );
}

function SubmissionRow({
  submission, maxPoints,
}: {
  submission: SubmissionWithName;
  maxPoints?: number;
}) {
  const attachments = submission.assignmentSubmission?.attachments ?? [];

  return (
    <li className="border-b last:border-b-0 py-2 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium truncate">{submission.studentName}</span>
        <StateBadge state={submission.state} late={submission.late} />
      </div>
      <div className="text-[11px] text-neutral-500 mt-0.5">
        {submission.assignedGrade != null
          ? <>Nota: <strong>{submission.assignedGrade}</strong>{maxPoints ? `/${maxPoints}` : ''}</>
          : 'Sin calificar'}
        {submission.updateTime && (
          <> · Actualizado {new Date(submission.updateTime).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</>
        )}
      </div>
      <AttachmentsRow attachments={attachments} />
    </li>
  );
}

function StateBadge({ state, late }: { state?: string; late?: boolean }) {
  const cls =
    state === 'TURNED_IN' ? 'bg-green-100 text-green-800' :
    state === 'RETURNED'  ? 'bg-blue-100 text-blue-800' :
    state === 'RECLAIMED_BY_STUDENT' ? 'bg-amber-100 text-amber-800' :
                            'bg-neutral-100 text-neutral-700';
  const label = state === 'TURNED_IN' ? 'Entregada'
              : state === 'RETURNED'  ? 'Devuelta'
              : state === 'RECLAIMED_BY_STUDENT' ? 'Retomada'
              : state === 'CREATED'   ? 'Asignada'
              : state ?? '—';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${cls}`}>
      {label}{late ? ' · tarde' : ''}
    </span>
  );
}

function AttachmentsRow({ attachments }: { attachments?: Attachment[] }) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {attachments.map((a, i) => {
        const drive = a.driveFile;
        const link = a.link;
        const yt = a.youTubeVideo;
        const form = a.form;
        const href = drive?.alternateLink ?? link?.url ?? yt?.alternateLink ?? form?.formUrl;
        const title = drive?.title ?? link?.title ?? yt?.title ?? form?.title ?? 'adjunto';
        const kind = drive ? 'Drive' : link ? 'Link' : yt ? 'YouTube' : form ? 'Form' : '—';
        if (!href) return null;
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] px-1.5 py-0.5 border rounded hover:bg-neutral-50 truncate max-w-[240px]"
            title={title}
          >
            <span className="text-neutral-400">{kind}</span> · {title}
          </a>
        );
      })}
    </div>
  );
}
