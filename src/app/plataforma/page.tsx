import Link from 'next/link';
import { CabeceraInterna } from '@/components/ListaDestinos';
import { FavoritoArrastrable } from '@/components/FavoritoArrastrable';
import { FAVORITOS, CON_EXTENSION, cargarFavorito } from '@/lib/bookmarklets';

/**
 * Todo lo que pasa del lado de la plataforma, en un solo lugar.
 *
 * Estaba repartido: la asistencia en el inicio, la matriz en su pantalla, las
 * notas viejas en Configuración. Cada una explicaba por su lado que hacía falta
 * instalar una extensión, y ninguna decía en qué orden se hacen ni cuál escribe
 * y cuál solo lee — que es lo primero que quiere saber alguien que nunca ha
 * dejado que un script toque las notas de sus estudiantes.
 */
export const metadata = { title: 'Plataforma' };

export default async function PlataformaPage() {
  const listos = await Promise.all(FAVORITOS.map(cargarFavorito));

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8">
      <CabeceraInterna
        volverA="/mas"
        volverTexto="Más"
        titulo="Plataforma del colegio"
        descripcion="Lo que la app puede hacer por ti allá, y cómo se instala."
      />

      <section className="panel p-4 space-y-2 text-sm">
        <h2 className="font-medium">Se arrastra una vez, y ya</h2>
        <p className="text-tinta-suave">
          Cada botón de abajo se arrastra a la barra de favoritos del navegador y
          queda ahí para siempre. Después abres la plataforma y lo pulsas. No hay
          nada que instalar, ni permisos que dar.
        </p>
        <p className="text-tinta-suave">
          Se hace <span className="font-medium">desde el computador</span>: en el
          celular no hay barra de favoritos a la que arrastrar.
        </p>
        <p className="text-tinta-suave">
          Si no ves la barra de favoritos, en Chrome se muestra con{' '}
          <kbd className="px-1 py-0.5 rounded border border-borde text-[11px]">Ctrl</kbd>
          {' + '}
          <kbd className="px-1 py-0.5 rounded border border-borde text-[11px]">Shift</kbd>
          {' + '}
          <kbd className="px-1 py-0.5 rounded border border-borde text-[11px]">B</kbd>.
        </p>
      </section>

      {listos.map((f, i) => {
        const base = FAVORITOS[i];
        return (
          <section key={base.id} className="tarjeta p-4 space-y-3">
            <div>
              <h2 className="font-medium">{base.titulo}</h2>
              <p className="text-sm text-tinta-suave mt-1">{base.para}</p>
            </div>

            <p className={`text-[13px] rounded-md px-3 py-2 ${
              base.escribe ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-900'
            }`}>
              {base.escribe ?? 'Solo lee. No cambia nada en la plataforma.'}
            </p>

            {f ? (
              <div className="flex flex-wrap items-center gap-3">
                <FavoritoArrastrable url={f.url} boton={base.boton} />
                <span className="text-[12px] text-tinta-tenue">
                  Arrástralo a tus favoritos. Pesa {f.kb} KB y desde aquí no hace
                  nada: solo funciona abierto sobre la plataforma.
                </span>
              </div>
            ) : (
              <p className="text-[13px] rounded-md px-3 py-2 bg-red-50 text-red-900">
                No se pudo preparar el botón en esta versión de la app. Mientras
                tanto, este camino se sigue haciendo con la extensión.
              </p>
            )}

            <ol className="text-sm space-y-1.5 list-decimal pl-5 marker:text-tinta-tenue">
              {base.pasos.map((p, n) => <li key={n}>{p}</li>)}
            </ol>

            {base.enLaApp && (
              <p className="text-sm">
                <Link href={base.enLaApp.href} className="text-acento hover:underline">
                  {base.enLaApp.texto} →
                </Link>
              </p>
            )}
          </section>
        );
      })}

      <section className="panel p-4 space-y-3">
        <div>
          <h2 className="font-medium">Lo único que va aparte</h2>
          <p className="text-sm text-tinta-suave mt-1">
            Y no es porque no se pueda: es porque conviene verlo.
          </p>
        </div>
        <ul className="space-y-3">
          {CON_EXTENSION.map(c => (
            <li key={c.titulo} className="text-sm">
              <span className="font-medium">{c.titulo}</span>
              <span className="block text-[13px] text-tinta-suave">{c.porque}</span>
              <Link href={c.enLaApp.href} className="text-acento hover:underline text-[13px]">
                {c.enLaApp.texto} →
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
