import { NextResponse, type NextRequest } from 'next/server';
import { getOAuth2Client } from '@/lib/googleOAuth';
import { saveTokens } from '@/lib/classroomSession';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const err = req.nextUrl.searchParams.get('error');
  if (err) {
    return NextResponse.redirect(new URL(`/classroom?error=${encodeURIComponent(err)}`, req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL('/classroom?error=missing_code', req.url));
  }
  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);
    await saveTokens(tokens);
    return NextResponse.redirect(new URL('/classroom', req.url));
  } catch (e) {
    return NextResponse.redirect(
      new URL(`/classroom?error=${encodeURIComponent((e as Error).message)}`, req.url),
    );
  }
}
