import { NextResponse } from 'next/server';
import { getAuthedClient } from '@/lib/classroomSession';
import { getProfile } from '@/lib/classroomApi';

export const runtime = 'nodejs';

export async function GET() {
  const client = await getAuthedClient();
  if (!client) return NextResponse.json({ connected: false }, { status: 200 });
  try {
    const profile = await getProfile(client);
    return NextResponse.json({ connected: true, profile });
  } catch (e) {
    return NextResponse.json({ connected: false, error: (e as Error).message }, { status: 200 });
  }
}
