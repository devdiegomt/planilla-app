import Link from 'next/link';
import { ImportPlanilla } from '@/components/ImportPlanilla';
import { ImportCodAlum } from '@/components/ImportCodAlum';
import { ImportHistorial } from '@/components/ImportHistorial';
import { ImportActividades } from '@/components/ImportActividades';
import { CabeceraInterna } from '@/components/ListaDestinos';

/**
 * Las cuatro son de puesta a punto, no del trabajo de la semana: la Planilla
 * una vez al año, los códigos cuando entra gente nueva, las notas de los
 * trimestres pasados una sola vez si se empezó con el año ya empezado, y los
 * porcentajes cuando el colegio cambie el reparto.
 */
export default function TraerPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <CabeceraInterna
        volverA="/ajustes"
        volverTexto="Configuración"
        titulo="Traer datos de la plataforma"
        descripcion="Cosas que se hacen una vez al año, o una sola vez."
      />

      <section className="border rounded-lg p-4 bg-neutral-50 space-y-5">
        <ImportPlanilla />
        <div className="border-t pt-4">
          <ImportCodAlum />
        </div>
        <div className="border-t pt-4">
          <ImportHistorial />
        </div>
        <div className="border-t pt-4">
          <ImportActividades />
          <p className="text-[11px] text-neutral-500 mt-2">
            Acá solo se traen. Para cambiarlos y mandarlos de vuelta,{' '}
            <Link href="/matriz" className="underline">edita la matriz de actividades</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
