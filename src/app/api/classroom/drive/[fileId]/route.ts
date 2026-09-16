import { NextResponse } from 'next/server';
import { getAuthedClient } from '@/lib/classroomSession';
import { planDeDescarga, conExtension, nombreSeguro } from '@/lib/driveExport';

export const runtime = 'nodejs';

const DRIVE = 'https://www.googleapis.com/drive/v3';

/**
 * Trae un archivo de Drive — el trabajo de un estudiante — para armar el ZIP.
 *
 * Existe porque el token vive en el servidor: el navegador no puede pedirle el
 * archivo a Drive por su cuenta sin que el token salga del servidor.
 *
 * El ZIP se arma en el navegador y no aquí a propósito. Una descarga de curso
 * completo son decenas de archivos, y una función de Vercel se corta al minuto;
 * además, hecho en el navegador se puede mostrar el avance y cancelar.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  const client = await getAuthedClient();
  if (!client) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  try {
    const { token } = await client.getAccessToken();
    const auth = { Authorization: `Bearer ${token}` };

    // Primero el tipo: decide si se descarga tal cual o hay que exportarlo.
    const metaRes = await fetch(
      `${DRIVE}/files/${encodeURIComponent(fileId)}?fields=name,mimeType&supportsAllDrives=true`,
      { headers: { ...auth, Accept: 'application/json' } },
    );
    if (!metaRes.ok) {
      const texto = await metaRes.text();
      return NextResponse.json(
        { error: `Drive ${metaRes.status}: ${texto.slice(0, 200)}` },
        { status: metaRes.status },
      );
    }
    const meta = await metaRes.json() as { name?: string; mimeType?: string };
    const plan = planDeDescarga(meta.mimeType);

    if (plan.tipo === 'omitir') {
      return NextResponse.json(
        { error: 'no_descargable', motivo: plan.motivo, nombre: meta.name },
        { status: 415 },
      );
    }

    const url = plan.tipo === 'exportar'
      ? `${DRIVE}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(plan.mime)}`
      : `${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;

    const fileRes = await fetch(url, { headers: auth });
    if (!fileRes.ok || !fileRes.body) {
      const texto = await fileRes.text().catch(() => '');
      return NextResponse.json(
        { error: `Drive ${fileRes.status}: ${texto.slice(0, 200)}` },
        { status: fileRes.status },
      );
    }

    const base = nombreSeguro(meta.name ?? 'trabajo');
    const nombre = plan.tipo === 'exportar' ? conExtension(base, plan.ext) : base;

    // Se pasa el cuerpo tal cual, sin juntarlo en memoria: un trabajo puede
    // pesar decenas de megas y la función tiene poca.
    return new NextResponse(fileRes.body, {
      headers: {
        'Content-Type': fileRes.headers.get('content-type') ?? 'application/octet-stream',
        // El navegador lo usa para nombrar el archivo dentro del ZIP.
        'X-Nombre-Archivo': encodeURIComponent(nombre),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
