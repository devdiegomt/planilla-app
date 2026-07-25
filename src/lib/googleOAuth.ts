/**
 * Helpers OAuth2 para Google Classroom (server-side only).
 * NUNCA importar desde componentes client.
 */

import { OAuth2Client } from 'google-auth-library';

// Scopes read-only para el flujo docente.
export const CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  'https://www.googleapis.com/auth/classroom.profile.emails',
  'https://www.googleapis.com/auth/userinfo.profile',
  // Necesario para descargar contenido de attachments (Google Docs, código fuente, etc.)
  'https://www.googleapis.com/auth/drive.readonly',
];

export function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI no configurados en .env.local',
    );
  }
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
}

export function buildAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',            // fuerza refresh_token
    prompt: 'consent',                 // fuerza mostrar consentimiento (para asegurar refresh_token cada vez)
    include_granted_scopes: true,
    scope: CLASSROOM_SCOPES,
  });
}
