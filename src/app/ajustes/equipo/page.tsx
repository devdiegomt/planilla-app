import { PwaInstall } from '@/components/PwaInstall';
import { PushSetup } from '@/components/PushSetup';
import { WipeDevice } from '@/components/WipeDevice';
import { CabeceraInterna } from '@/components/ListaDestinos';

/**
 * Lo que vale solo para el aparato en el que se está.
 *
 * Instalar, los avisos y el borrado van juntos porque los tres son de ESTE
 * equipo y no de la cuenta: borrar acá no borra nada de los demás. El borrado
 * va al final y con borde rojo, que es lo único de Configuración sin vuelta
 * atrás.
 */
export default function EquipoPage() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <CabeceraInterna
        volverA="/ajustes"
        volverTexto="Configuración"
        titulo="Este equipo"
        descripcion="Lo que vale solo para el celular o el computador en el que estás."
      />

      <section className="border rounded-lg p-4 bg-neutral-50">
        <h2 className="font-medium mb-3">Instalar la app</h2>
        <PwaInstall />
      </section>

      <section className="border rounded-lg p-4 bg-neutral-50">
        <h2 className="font-medium mb-3">Avisos</h2>
        <PushSetup />
      </section>

      <section className="border border-red-200 rounded-lg p-4 bg-red-50">
        <h2 className="font-medium mb-3 text-red-900">Borrar los datos de este equipo</h2>
        <WipeDevice />
      </section>
    </main>
  );
}
