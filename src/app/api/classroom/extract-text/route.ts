import { NextResponse, type NextRequest } from 'next/server';
import { getAuthedClient } from '@/lib/classroomSession';
import { extractAttachmentsText } from '@/lib/driveApi';
import type { Attachment } from '@/lib/classroomApi';

export const runtime = 'nodejs';
export const maxDuration = 45;

interface Body {
  attachments: Attachment[];
}

export async function POST(req: NextRequest) {
  const client = await getAuthedClient();
  if (!client) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  if (!Array.isArray(body?.attachments) || body.attachments.length === 0) {
    return NextResponse.json({ error: 'Se requiere `attachments` no vacío.' }, { status: 400 });
  }

  try {
    const result = await extractAttachmentsText(client, body.attachments);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
