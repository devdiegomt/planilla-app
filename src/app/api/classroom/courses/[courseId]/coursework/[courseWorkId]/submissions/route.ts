import { NextResponse } from 'next/server';
import { getAuthedClient } from '@/lib/classroomSession';
import { listSubmissions, listStudents } from '@/lib/classroomApi';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ courseId: string; courseWorkId: string }> },
) {
  const { courseId, courseWorkId } = await params;
  const client = await getAuthedClient();
  if (!client) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  try {
    const [submissions, students] = await Promise.all([
      listSubmissions(client, courseId, courseWorkId),
      listStudents(client, courseId),
    ]);
    // Denormalizar nombre del estudiante para el UI
    const nameByUser = new Map<string, string>();
    for (const s of students) {
      if (s.userId && s.profile?.name?.fullName) {
        nameByUser.set(s.userId, s.profile.name.fullName);
      }
    }
    const enriched = submissions.map(sub => ({
      ...sub,
      studentName: nameByUser.get(sub.userId) ?? '(estudiante)',
    }));
    return NextResponse.json({ submissions: enriched });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
