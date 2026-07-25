import { NextResponse } from 'next/server';
import { getAuthedClient } from '@/lib/classroomSession';
import { listCourseWork } from '@/lib/classroomApi';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params;
  const client = await getAuthedClient();
  if (!client) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  try {
    const coursework = await listCourseWork(client, courseId);
    return NextResponse.json({ coursework });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
