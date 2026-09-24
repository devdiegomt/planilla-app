import { MatrizEditor } from '@/components/MatrizEditor';

/**
 * La matriz de actividades. Está en su propia página y no en Ajustes porque es
 * una tabla ancha de cuatro grados: dentro de una tarjeta no se lee.
 */
export default function MatrizPage() {
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Matriz de actividades</h1>
        <p className="text-sm text-neutral-500">
          Qué actividad va en cada casilla, cuánto pesa, en qué ciclo cae y si es
          para casa o para clase. Se edita acá y se manda a la plataforma.
        </p>
      </header>
      <MatrizEditor />
    </main>
  );
}
