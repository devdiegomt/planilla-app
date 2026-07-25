import { NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/googleOAuth';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.redirect(buildAuthUrl());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
