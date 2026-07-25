import { NextResponse, type NextRequest } from 'next/server';
import { gradeSubmission, type GradeRequest } from '@/lib/aiGrader';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: GradeRequest;
  try {
    body = (await req.json()) as GradeRequest;
  } catch {
    return NextResponse.json({ error: 'JSON inválido en el body.' }, { status: 400 });
  }

  if (!body?.rubric || !body?.submissionText) {
    return NextResponse.json(
      { error: 'Se requiere `rubric` y `submissionText`.' },
      { status: 400 },
    );
  }
  if (body.submissionText.length > 200_000) {
    return NextResponse.json(
      { error: 'La entrega excede 200,000 caracteres. Divide en partes o resume.' },
      { status: 413 },
    );
  }
  if (!Array.isArray(body.rubric.criteria) || body.rubric.criteria.length === 0) {
    return NextResponse.json(
      { error: 'La rúbrica debe tener al menos un criterio.' },
      { status: 400 },
    );
  }

  try {
    const result = await gradeSubmission(body);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message;
    const isAuthErr = msg.includes('ANTHROPIC_API_KEY');
    return NextResponse.json({ error: msg }, { status: isAuthErr ? 503 : 500 });
  }
}
