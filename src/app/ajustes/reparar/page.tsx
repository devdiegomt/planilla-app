import { RepairPanel } from '@/components/RepairPanel';
import { CabeceraInterna } from '@/components/ListaDestinos';

export default function Pagina() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <CabeceraInterna
        volverA="/ajustes"
        volverTexto="Configuración"
        titulo="Si algo falla"
        descripcion="Revisa que los datos estén sanos y repara lo que se pueda."
      />
      <RepairPanel />
    </main>
  );
}
