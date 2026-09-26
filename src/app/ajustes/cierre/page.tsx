import { CloseTrimester } from '@/components/CloseTrimester';
import { CabeceraInterna } from '@/components/ListaDestinos';

export default function Pagina() {
  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <CabeceraInterna
        volverA="/ajustes"
        volverTexto="Configuración"
        titulo="Cierre de trimestre"
        descripcion="Archiva las notas del trimestre y deja la planilla en blanco para el siguiente."
      />
      <CloseTrimester />
    </main>
  );
}
