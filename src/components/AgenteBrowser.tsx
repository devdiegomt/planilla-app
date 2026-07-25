'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db, addRubric, updateRubric, deleteRubric,
  addGradingResult, deleteGradingResult,
} from '@/lib/db';
import { CURSOS_ORDER } from '@/lib/constants';
import type {
  Rubric, RubricCriterion, GradingResult, CriterionScore,
} from '@/types';

export function AgenteBrowser() {
  const rubrics = useLiveQuery(() => db.rubrics.orderBy('createdAt').reverse().toArray()) ?? [];
  const results = useLiveQuery(
    () => db.gradingResults.orderBy('at').reverse().limit(20).toArray(),
  ) ?? [];

  const [selectedRubricId, setSelectedRubricId] = useState<number | null>(null);
  const selectedRubric = useMemo(
    () => rubrics.find(r => r.id === selectedRubricId) ?? null,
    [rubrics, selectedRubricId],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        <RubricList
          rubrics={rubrics}
          selectedId={selectedRubricId}
          onSelect={setSelectedRubricId}
        />
        <ResultHistory results={results} />
      </div>

      <div className="space-y-6">
        <RubricEditor
          rubric={selectedRubric}
          onSaved={id => setSelectedRubricId(id)}
        />
        <GraderPanel rubric={selectedRubric} />
      </div>
    </div>
  );
}

// ---- Lista lateral ----

function RubricList({
  rubrics, selectedId, onSelect,
}: {
  rubrics: Rubric[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  return (
    <div className="border rounded-lg bg-white">
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wide text-neutral-500">Rúbricas</h3>
        <button
          onClick={() => onSelect(null)}
          className="text-xs text-neutral-900 hover:underline font-medium"
        >
          + Nueva
        </button>
      </div>
      {rubrics.length === 0 ? (
        <p className="p-3 text-sm text-neutral-500">
          Aún no hay rúbricas. Crea una para empezar.
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto divide-y divide-neutral-100">
          {rubrics.map(r => (
            <li key={r.id}>
              <button
                onClick={() => onSelect(r.id!)}
                className={`w-full text-left px-3 py-2 hover:bg-neutral-50 ${
                  selectedId === r.id ? 'bg-neutral-100' : ''
                }`}
              >
                <div className="text-sm font-medium truncate">{r.name}</div>
                <div className="text-[11px] text-neutral-500">
                  {r.criteria.length} criterios · máx {r.maxPoints}
                  {r.courseCode && ` · ${r.courseCode}`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- Editor de rúbrica ----

const EMPTY_RUBRIC: Rubric = {
  name: '',
  description: '',
  criteria: [
    { name: 'Correctitud', weight: 40, description: 'La solución produce el resultado esperado.' },
    { name: 'Estilo y claridad', weight: 30, description: 'Código legible, buenos nombres, sin duplicación.' },
    { name: 'Explicación', weight: 30, description: 'El estudiante justifica sus decisiones.' },
  ],
  maxPoints: 100,
  createdAt: '',
};

function RubricEditor({
  rubric, onSaved,
}: {
  rubric: Rubric | null;
  onSaved: (id: number) => void;
}) {
  const [draft, setDraft] = useState<Rubric>(rubric ?? EMPTY_RUBRIC);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  // Sync when a different rubric is selected
  const rubricId = rubric?.id ?? 0;
  const [lastLoadedId, setLastLoadedId] = useState<number>(0);
  if (rubricId !== lastLoadedId) {
    setDraft(rubric ?? EMPTY_RUBRIC);
    setLastLoadedId(rubricId);
    setStatus('');
  }

  const totalWeight = draft.criteria.reduce((a, c) => a + c.weight, 0);
  const isEditing = rubric?.id != null;

  const setCriterion = (i: number, patch: Partial<RubricCriterion>) => {
    setDraft(d => ({
      ...d,
      criteria: d.criteria.map((c, idx) => idx === i ? { ...c, ...patch } : c),
    }));
  };

  const addCriterion = () => setDraft(d => ({
    ...d,
    criteria: [...d.criteria, { name: '', weight: 0, description: '' }],
  }));

  const removeCriterion = (i: number) => setDraft(d => ({
    ...d,
    criteria: d.criteria.filter((_, idx) => idx !== i),
  }));

  const save = async () => {
    if (!draft.name.trim() || draft.criteria.length === 0) return;
    setSaving(true); setStatus('');
    try {
      const cleaned: Omit<Rubric, 'id'> = {
        name: draft.name.trim(),
        description: draft.description?.trim() || undefined,
        criteria: draft.criteria
          .filter(c => c.name.trim() && c.weight > 0)
          .map(c => ({ name: c.name.trim(), weight: c.weight, description: c.description.trim() })),
        maxPoints: draft.maxPoints,
        courseCode: draft.courseCode || undefined,
        createdAt: isEditing ? draft.createdAt : new Date().toISOString(),
      };
      if (isEditing) {
        await updateRubric(rubric!.id!, cleaned);
        setStatus('✓ Rúbrica actualizada');
        onSaved(rubric!.id!);
      } else {
        const id = await addRubric(cleaned);
        setStatus('✓ Rúbrica creada');
        onSaved(id);
      }
    } catch (e) {
      setStatus(`❌ ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!isEditing) return;
    if (!confirm(`¿Borrar rúbrica "${rubric!.name}"? Los resultados históricos se conservan.`)) return;
    await deleteRubric(rubric!.id!);
    onSaved(0);
  };

  return (
    <div className="border rounded-lg bg-white p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">
          {isEditing ? 'Editar rúbrica' : 'Nueva rúbrica'}
        </h3>
        <span className={`text-xs ${totalWeight === draft.maxPoints ? 'text-green-700' : 'text-amber-700'}`}>
          Suma pesos: {totalWeight}/{draft.maxPoints}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-sm sm:col-span-2">
          <span className="text-xs text-neutral-500 block mb-0.5">Nombre</span>
          <input
            type="text"
            value={draft.name}
            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="Ej. Proyecto Python — Ciclo 5"
            className="w-full border rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-neutral-500 block mb-0.5">Curso (opcional)</span>
          <select
            value={draft.courseCode ?? ''}
            onChange={e => setDraft(d => ({ ...d, courseCode: e.target.value || undefined }))}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            <option value="">Sin curso</option>
            {CURSOS_ORDER.map(c => <option key={c} value={String(c)}>{c}</option>)}
          </select>
        </label>
      </div>

      <label className="text-sm block">
        <span className="text-xs text-neutral-500 block mb-0.5">Descripción (opcional)</span>
        <textarea
          value={draft.description ?? ''}
          onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
          rows={2}
          className="w-full border rounded px-2 py-1 text-sm"
          placeholder="Qué se está evaluando en general."
        />
      </label>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-xs text-neutral-500">Criterios</span>
          <button
            onClick={addCriterion}
            className="text-xs text-neutral-900 hover:underline"
          >
            + Añadir criterio
          </button>
        </div>
        <ul className="space-y-2">
          {draft.criteria.map((c, i) => (
            <li key={i} className="border rounded p-2 grid gap-2 sm:grid-cols-[1fr_80px_2fr_auto] items-start">
              <input
                type="text"
                value={c.name}
                onChange={e => setCriterion(i, { name: e.target.value })}
                placeholder="Nombre"
                className="border rounded px-2 py-1 text-sm"
              />
              <input
                type="number"
                min={0}
                max={100}
                value={c.weight}
                onChange={e => setCriterion(i, { weight: parseInt(e.target.value) || 0 })}
                className="border rounded px-2 py-1 text-sm text-right"
              />
              <input
                type="text"
                value={c.description}
                onChange={e => setCriterion(i, { description: e.target.value })}
                placeholder="Qué evalúa este criterio"
                className="border rounded px-2 py-1 text-sm"
              />
              <button
                onClick={() => removeCriterion(i)}
                className="text-xs text-neutral-400 hover:text-red-700 px-2 py-1"
                title="Borrar criterio"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-3 pt-2 border-t">
        <label className="text-sm flex items-center gap-2">
          <span className="text-xs text-neutral-500">Puntaje máximo:</span>
          <input
            type="number"
            min={1}
            max={100}
            value={draft.maxPoints}
            onChange={e => setDraft(d => ({ ...d, maxPoints: parseInt(e.target.value) || 100 }))}
            className="w-16 border rounded px-2 py-1 text-sm text-right"
          />
        </label>
        <button
          disabled={saving || !draft.name.trim() || draft.criteria.length === 0}
          onClick={save}
          className="ml-auto px-4 py-1.5 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-40"
        >
          {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear rúbrica'}
        </button>
        {isEditing && (
          <button
            onClick={remove}
            className="text-xs text-red-600 hover:text-red-800 underline"
          >
            Borrar
          </button>
        )}
      </div>
      {status && <p className="text-xs text-neutral-600">{status}</p>}
    </div>
  );
}

// ---- Calificador ----

interface GraderPanelState {
  submissionText: string;
  studentName: string;
  additionalContext: string;
  loading: boolean;
  result: {
    grade: number;
    breakdown: CriterionScore[];
    feedback: string;
    model: string;
    tokensUsed: { input: number; output: number };
  } | null;
  error: string | null;
}

function GraderPanel({ rubric }: { rubric: Rubric | null }) {
  const [state, setState] = useState<GraderPanelState>({
    submissionText: '',
    studentName: '',
    additionalContext: '',
    loading: false,
    result: null,
    error: null,
  });
  const [handoffNote, setHandoffNote] = useState<string | null>(null);

  // Al montar, si hay handoff pendiente desde /classroom, precargar el panel.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = sessionStorage.getItem('agente:handoff');
    if (!raw) return;
    try {
      const h = JSON.parse(raw) as {
        submissionText: string;
        studentName?: string;
        additionalContext?: string;
        at?: number;
      };
      // Ignorar handoffs viejos (>10 min) para no revivir sesiones olvidadas
      if (h.at && Date.now() - h.at > 10 * 60_000) {
        sessionStorage.removeItem('agente:handoff');
        return;
      }
      setState(s => ({
        ...s,
        submissionText: h.submissionText,
        studentName: h.studentName ?? '',
        additionalContext: h.additionalContext ?? '',
      }));
      setHandoffNote(
        `Entrega precargada desde Classroom${h.studentName ? ` (${h.studentName})` : ''}.`,
      );
      sessionStorage.removeItem('agente:handoff');
    } catch {
      sessionStorage.removeItem('agente:handoff');
    }
  }, []);

  const disabled = !rubric || state.loading || state.submissionText.trim().length === 0;

  const grade = async () => {
    if (!rubric) return;
    setState(s => ({ ...s, loading: true, error: null, result: null }));
    try {
      const res = await fetch('/api/agent/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rubric,
          submissionText: state.submissionText,
          studentName: state.studentName || undefined,
          courseCode: rubric.courseCode,
          additionalContext: state.additionalContext || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setState(s => ({ ...s, loading: false, result: data }));
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: (e as Error).message }));
    }
  };

  const saveResult = async () => {
    if (!rubric || !state.result) return;
    await addGradingResult({
      rubricId: rubric.id!,
      rubricName: rubric.name,
      submissionPreview: state.submissionText.slice(0, 500),
      submissionLength: state.submissionText.length,
      grade: state.result.grade,
      breakdown: state.result.breakdown,
      feedback: state.result.feedback,
      studentName: state.studentName || undefined,
      courseCode: rubric.courseCode,
      model: state.result.model,
      tokensUsed: state.result.tokensUsed,
      at: new Date().toISOString(),
    });
    setState(s => ({ ...s, result: null, submissionText: '' }));
  };

  if (!rubric) {
    return (
      <div className="border rounded-lg bg-neutral-50 p-6 text-sm text-neutral-500 text-center">
        Selecciona (o crea) una rúbrica para empezar a calificar.
      </div>
    );
  }

  return (
    <div className="border rounded-lg bg-white p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Calificar entrega</h3>
        {(state.submissionText.length > 0 || state.studentName.length > 0) && (
          <button
            onClick={() => setState(s => ({
              ...s, submissionText: '', studentName: '', additionalContext: '',
              result: null, error: null,
            }))}
            className="text-[11px] text-neutral-500 hover:text-neutral-900 underline"
          >
            Limpiar
          </button>
        )}
      </div>

      {handoffNote && (
        <div className="border-l-4 border-blue-500 bg-blue-50 rounded-r px-3 py-2 text-xs text-blue-900">
          ✓ {handoffNote}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-xs text-neutral-500 block mb-0.5">Estudiante (opcional)</span>
          <input
            type="text"
            value={state.studentName}
            onChange={e => setState(s => ({ ...s, studentName: e.target.value }))}
            className="w-full border rounded px-2 py-1 text-sm"
            placeholder="Nombre para el registro"
          />
        </label>
        <label className="text-sm">
          <span className="text-xs text-neutral-500 block mb-0.5">Contexto adicional (opcional)</span>
          <input
            type="text"
            value={state.additionalContext}
            onChange={e => setState(s => ({ ...s, additionalContext: e.target.value }))}
            className="w-full border rounded px-2 py-1 text-sm"
            placeholder="Ej. entrega en Python 3.12"
          />
        </label>
      </div>

      <label className="text-sm block">
        <span className="text-xs text-neutral-500 block mb-0.5">
          Entrega del estudiante ({state.submissionText.length} chars)
        </span>
        <textarea
          value={state.submissionText}
          onChange={e => setState(s => ({ ...s, submissionText: e.target.value }))}
          rows={10}
          className="w-full border rounded px-2 py-1 text-sm font-mono"
          placeholder="Pega aquí el código, texto o respuesta del estudiante..."
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          disabled={disabled}
          onClick={grade}
          className="px-4 py-1.5 rounded-md bg-neutral-900 text-white text-sm disabled:opacity-40"
        >
          {state.loading ? 'Calificando…' : `Calificar con ${rubric.name}`}
        </button>
        <span className="text-xs text-neutral-500">
          Rúbrica: {rubric.criteria.length} criterios · máx {rubric.maxPoints}
        </span>
      </div>

      {state.error && (
        <div className="border border-red-200 bg-red-50 rounded p-3 text-sm text-red-800">
          ❌ {state.error}
        </div>
      )}

      {state.result && (
        <ResultCard
          result={state.result}
          onSave={saveResult}
          onDiscard={() => setState(s => ({ ...s, result: null }))}
        />
      )}
    </div>
  );
}

function ResultCard({
  result, onSave, onDiscard,
}: {
  result: {
    grade: number;
    breakdown: CriterionScore[];
    feedback: string;
    model: string;
    tokensUsed: { input: number; output: number };
  };
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="border rounded-lg bg-neutral-50 p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h4 className="text-sm font-medium">Resultado propuesto</h4>
        <span className="text-2xl font-semibold tabular-nums">{result.grade}</span>
      </div>

      <div className="grid gap-1.5">
        {result.breakdown.map((b, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] gap-2 text-sm">
            <div>
              <div className="font-medium">{b.name}</div>
              <div className="text-xs text-neutral-600">{b.reasoning}</div>
            </div>
            <div className="text-right tabular-nums font-medium">
              {b.score}/{b.maxScore}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t pt-3">
        <div className="text-xs text-neutral-500 mb-1">Retroalimentación al estudiante</div>
        <p className="text-sm whitespace-pre-wrap">{result.feedback}</p>
      </div>

      <div className="flex items-center gap-3 text-xs text-neutral-500 border-t pt-2">
        <span>Modelo: {result.model}</span>
        <span>Tokens: {result.tokensUsed.input}→{result.tokensUsed.output}</span>
        <button
          onClick={onSave}
          className="ml-auto px-3 py-1 rounded-md bg-neutral-900 text-white text-xs"
        >
          Guardar en historial
        </button>
        <button
          onClick={onDiscard}
          className="text-xs text-neutral-600 hover:text-neutral-900 underline"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}

// ---- Historial ----

function ResultHistory({ results }: { results: GradingResult[] }) {
  return (
    <div className="border rounded-lg bg-white">
      <div className="px-3 py-2 border-b">
        <h3 className="text-xs uppercase tracking-wide text-neutral-500">Historial reciente</h3>
      </div>
      {results.length === 0 ? (
        <p className="p-3 text-sm text-neutral-500">Sin calificaciones guardadas.</p>
      ) : (
        <ul className="max-h-72 overflow-y-auto divide-y divide-neutral-100">
          {results.map(r => (
            <li key={r.id} className="px-3 py-2 flex items-baseline gap-2">
              <span className="text-sm font-medium tabular-nums w-8">{r.grade}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs truncate">
                  {r.studentName || '(sin nombre)'}
                  {r.courseCode && <span className="text-neutral-500"> · {r.courseCode}</span>}
                </div>
                <div className="text-[10px] text-neutral-500 truncate">
                  {r.rubricName} · {new Date(r.at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                </div>
              </div>
              <button
                onClick={() => deleteGradingResult(r.id!)}
                className="text-[10px] text-neutral-400 hover:text-red-700 shrink-0"
                title="Borrar del historial"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
