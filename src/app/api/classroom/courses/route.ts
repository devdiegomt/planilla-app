import { NextResponse } from 'next/server';
import { getAuthedClient } from '@/lib/classroomSession';
import { listCourses } from '@/lib/classroomApi';

export const runtime = 'nodejs';

export async function GET() {
  const client = await getAuthedClient();
  if (!client) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  try {
    const courses = await listCourses(client);
    return NextResponse.json({ courses });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
