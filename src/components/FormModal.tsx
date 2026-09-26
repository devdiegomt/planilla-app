'use client';

/**
 * Las piezas del formulario en ventana que comparten el editor del horario y
 * el de lo temporal. Estaban dentro de HorarioEditor; salieron acá cuando el
 * segundo editor las necesitó igual, para que las dos ventanas se vean y se
 * comporten igual sin copiarlas.
 */

export function FormModal({
  label, onClose, children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    // z-[60]: por encima de la barra inferior de móvil, que va en z-50.
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative w-full sm:max-w-md bg-white rounded-t-xl sm:rounded-xl border shadow-lg
                   p-4 space-y-3 max-h-[85vh] overflow-y-auto
                   pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4"
      >
        {children}
      </div>
    </div>
  );
}

export function Campo({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-neutral-600">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-neutral-500">{hint}</span>}
    </label>
  );
}

export function HorasCampo({
  startTime, endTime, onChange, minutos, horasOk, opcional,
}: {
  startTime: string;
  endTime: string;
  onChange: (patch: { startTime?: string; endTime?: string }) => void;
  minutos: number;
  horasOk: boolean;
  /** Si es opcional, dejarlas en blanco significa "de todo el día". */
  opcional?: boolean;
}) {
  const vacias = !startTime && !endTime;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Inicio">
          <input
            type="time"
            value={startTime}
            onChange={e => onChange({ startTime: e.target.value })}
            className="w-full border rounded px-2 py-1.5"
          />
        </Campo>
        <Campo label="Fin">
          <input
            type="time"
            value={endTime}
            onChange={e => onChange({ endTime: e.target.value })}
            className="w-full border rounded px-2 py-1.5"
          />
        </Campo>
      </div>
      <p className="text-xs text-neutral-500">
        {horasOk
          ? `${minutos} min`
          : opcional && vacias
            ? 'Sin hora: queda como algo de todo el día.'
            : 'Pon una hora de fin posterior a la de inicio.'}
      </p>
    </>
  );
}

export function Botones({
  onGuardar, puedeGuardar, onClose, onBorrar,
}: {
  onGuardar: () => void;
  puedeGuardar: boolean;
  onClose: () => void;
  onBorrar?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <button
        onClick={onGuardar}
        disabled={!puedeGuardar}
        className="px-3 py-1.5 rounded-md boton-primario text-sm disabled:opacity-40"
      >
        Guardar
      </button>
      <button onClick={onClose} className="px-3 py-1.5 rounded-md border text-sm">
        Cancelar
      </button>
      {onBorrar && (
        <button onClick={onBorrar} className="ml-auto text-sm text-red-600 hover:text-red-800">
          Borrar
        </button>
      )}
    </div>
  );
}
