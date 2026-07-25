/**
 * Agente IA calificador — server-side only.
 * Nunca importar desde componentes client. Requiere ANTHROPIC_API_KEY.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Rubric, CriterionScore } from '@/types';

const MODEL = 'claude-opus-5';

export interface GradeRequest {
  rubric: Rubric;
  submissionText: string;
  studentName?: string;
  courseCode?: string;
  additionalContext?: string;
}

export interface GradeResponse {
  grade: number;
  breakdown: CriterionScore[];
  feedback: string;
  model: string;
  tokensUsed: { input: number; output: number };
}

function client(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY no configurada. Añádela a .env.local (obtenerla en https://console.anthropic.com/settings/keys)',
    );
  }
  return new Anthropic({ apiKey });
}

function buildSystemPrompt(rubric: Rubric): string {
  return [
    `Eres un docente que califica entregas de estudiantes usando una rúbrica precisa.`,
    ``,
    `RÚBRICA: ${rubric.name}`,
    rubric.description ? `Descripción: ${rubric.description}` : '',
    `Puntaje máximo total: ${rubric.maxPoints}`,
    ``,
    `Criterios:`,
    ...rubric.criteria.map(
      (c, i) =>
        `${i + 1}. ${c.name} (peso ${c.weight}/${rubric.maxPoints}): ${c.description}`,
    ),
    ``,
    `INSTRUCCIONES:`,
    `- Evalúa cada criterio de forma independiente contra la entrega del estudiante.`,
    `- El score por criterio va de 0 a su peso (máximo). Sé preciso, no repartas puntos "de cortesía".`,
    `- La calificación total = suma de scores por criterio (0 a ${rubric.maxPoints}).`,
    `- El campo "reasoning" de cada criterio debe justificar en 1-2 frases por qué diste ese puntaje, citando algo concreto de la entrega cuando sea posible.`,
    `- El "feedback" es un mensaje al estudiante en tono constructivo (3-6 líneas): qué hizo bien, qué mejorar. No repitas el reasoning de los criterios.`,
    `- Devuelve JSON exacto según el schema.`,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserMessage(req: GradeRequest): string {
  const parts: string[] = [];
  if (req.studentName) parts.push(`Estudiante: ${req.studentName}`);
  if (req.courseCode) parts.push(`Curso: ${req.courseCode}`);
  if (req.additionalContext) parts.push(`Contexto adicional: ${req.additionalContext}`);
  parts.push('');
  parts.push('ENTREGA DEL ESTUDIANTE:');
  parts.push('---');
  parts.push(req.submissionText);
  parts.push('---');
  parts.push('');
  parts.push('Califica la entrega según la rúbrica.');
  return parts.join('\n');
}

function outputSchema(rubric: Rubric) {
  return {
    type: 'object' as const,
    additionalProperties: false,
    required: ['breakdown', 'feedback'],
    properties: {
      breakdown: {
        type: 'array' as const,
        description: 'Puntaje por cada criterio, en el orden de la rúbrica.',
        items: {
          type: 'object' as const,
          additionalProperties: false,
          required: ['name', 'score', 'reasoning'],
          properties: {
            name: {
              type: 'string' as const,
              enum: rubric.criteria.map(c => c.name),
            },
            score: {
              type: 'number' as const,
              description: 'Puntaje asignado a este criterio (0..peso del criterio).',
            },
            reasoning: {
              type: 'string' as const,
              description: 'Justificación breve del puntaje (1-2 frases).',
            },
          },
        },
      },
      feedback: {
        type: 'string' as const,
        description: 'Retroalimentación al estudiante (3-6 líneas, tono constructivo).',
      },
    },
  };
}

export async function gradeSubmission(req: GradeRequest): Promise<GradeResponse> {
  const anthropic = client();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: buildSystemPrompt(req.rubric),
    messages: [{ role: 'user', content: buildUserMessage(req) }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: outputSchema(req.rubric),
      },
    },
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(
      'El modelo rechazó la solicitud por políticas de seguridad. Revisa el contenido de la entrega.',
    );
  }

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Respuesta del modelo sin contenido de texto.');
  }

  let parsed: { breakdown: { name: string; score: number; reasoning: string }[]; feedback: string };
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new Error(`Respuesta del modelo no es JSON válido: ${textBlock.text.slice(0, 200)}`);
  }

  // Reconstruir breakdown con maxScore de la rúbrica
  const breakdown: CriterionScore[] = parsed.breakdown.map(item => {
    const criterion = req.rubric.criteria.find(c => c.name === item.name);
    const maxScore = criterion?.weight ?? 0;
    return {
      name: item.name,
      score: Math.max(0, Math.min(maxScore, item.score)),
      maxScore,
      reasoning: item.reasoning,
    };
  });

  const grade = Math.round(breakdown.reduce((a, b) => a + b.score, 0));

  return {
    grade,
    breakdown,
    feedback: parsed.feedback,
    model: MODEL,
    tokensUsed: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    },
  };
}
