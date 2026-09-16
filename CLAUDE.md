# planilla-app — contexto para Claude

App de Diego Mayorga, docente de informática del Colegio GLA (Colombia), para sus
19 cursos de 8° a 11° (801–806, 901–905, 1001–1004, 1101–1104; ~540 estudiantes).
Next.js 15 (App Router) + Dexie (IndexedDB, local-first) + Supabase (auth OTP y sync)
+ Vercel (deploy, crons, push VAPID). Producción: https://planillaapp.vercel.app

Repo hermano: **planilla-v2** (`devdiegomt/planilla-v2`), userscripts sobre la
plataforma del colegio (Classroom Live). Ver "Integraciones".

## Comandos

- `npm run dev` — servidor de desarrollo
- `npx tsc --noEmit` — typecheck, la puerta obligatoria. No hay runner de tests ni ESLint.
- Deploy: merge a `main` → Vercel.

## Cómo trabajar con Diego

- Chat, UI y comentarios en español; identificadores en inglés.
- Alcance pequeño y entregable; proponer una opción recomendada en vez de muchas
  preguntas. Para funciones grandes, plan corto antes de programar.
- Git: nunca commitear sin que lo pida. Cuando lo pide: rama nueva desde `main`
  actualizado (`fix/…`, `feat/…`), commit en español, push, y Diego abre y mergea
  el PR. No empujar directo a `main`.
- Él prueba en Vercel después del merge; no hace falta probar cada ruta en navegador
  si el typecheck y las pruebas de lógica pasan.
- **Datos de estudiantes (menores de edad):** nunca commitear archivos reales (Califica,
  Planilla, JSON con nombres o códigos) ni dejarlos en `public/`. Si Diego adjunta uno
  para probar, se usa fuera del repo y no se sube.
- Pruebas en navegador con datos sintéticos en IndexedDB: **borrarlos siempre al
  terminar**. Nunca dejar filas de prueba en su base.
- Pruebas de lógica sin navegador: transpilar los `.ts` de `src/lib` con `typescript`
  (`transpileModule` a CommonJS) en una carpeta temporal fuera del repo y ejecutarlos
  con Node contra los archivos reales o sintéticos.
- Secretos solo en servidor: nunca con prefijo `NEXT_PUBLIC_`. Diego configura él mismo
  Vercel, Supabase, Resend y Google Cloud; darle pasos exactos.

## Dominio del colegio

- **Notas:** `0` = sin calificar (el algoritmo de la plataforma lo ignora); `30` =
  `NOTA_MIN`, la mínima real. Aprobación 70, experto 80, máximo 100.
- **Categorías K/M/U/C/E**, cada una 20 % de la definitiva. E es la evaluación
  trimestral (columna C7). Pesos internos en `SLOTS_8_10` y `SLOTS_11` (`lib/constants.ts`).
- **Fórmula "platform"** (la de la app): promedio ponderado por categoría ignorando
  ceros, definitiva = promedio de categorías > 0, redondeo half-up. Validada contra la
  plataforma; no cambiarla sin volver a validar.
- **Días:** rotación D1–D5 de lunes a jueves; el viernes es Día Fijo. Festivos
  (Colombia) y cancelaciones no consumen rotación.
- `cod_mat` depende del grado: 2508, 2509, 2510 y **3011** para 11°. Ya no es una
  constante: vive en `YearConfig.subjects` y se edita en /ajustes → "Mis materias".

## Invariantes que ya costaron bugs

- **Relaciones por `courseCode` / `studentSyncId`, nunca por `courseId` / `studentId`.**
  Los ids de Dexie son locales y `stripLocalMeta` los borra antes de subir; del lado
  del servidor comparar `courseId` da `undefined === undefined`.
- **syncId deterministas** (`lib/syncId.ts`): el mismo curso o estudiante produce el
  mismo UUID en cualquier dispositivo. Reimportar no debe duplicar.
- **Migraciones Dexie:** nunca modificar una versión existente. Siempre una versión
  nueva que repita todos los stores.
- **Tabla sincronizable nueva** = registrarla en tres lugares: `SYNCABLE` (hooks en
  `lib/db.ts`), `SYNCABLE_TABLES` (`lib/sync.ts`) y `TABLES` (`lib/backup.ts`). Si el dato
  cabe como campo opcional de una tabla que ya sincroniza, sale más barato: el sync sube
  la fila entera como JSON, así que un campo no indexado no necesita migración ni tocar
  Supabase (así se agregaron `ScheduleBlock.kind` y `YearConfig.subjects`).
- **Nada del docente en constantes.** Los cursos, los grados y las materias salen de lo
  que el docente importó o configuró, no de `lib/constants.ts`. Ahí vivían `CURSOS_ORDER`,
  `DIRECTORES` y `GRADE_META`, y ataban la app a un solo profesor. Lo que queda atado son
  `SLOTS_8_10` y `SLOTS_11`.
- **El ciclo es de la rotación, no del curso** (`lib/cycles.ts`). Un ciclo es una vuelta
  D1→D5; el viernes (FIJO) no consume rotación y pertenece al ciclo en curso, así que un
  ciclo puede traer dos viernes. No asumir `grade === 11 ? 2 : 1` sesiones: usar
  `sessionDatesOf`. Verificado contra el cronograma real del colegio.
- **La rotación es continua:** `computeDayTypes` no la reinicia por trimestre. El primer
  día de cada trimestre se fuerza a D1 desde `/calendario`, y las semanas sin clase se
  marcan; si no, la numeración de ciclos se corre.
- **Asistencia:** banderas `F`/`Fj`/`R`/`Rj`. Si el ciclo trae dos clases del curso,
  marcas, razones y confirmación van por sesión (`S1`/`S2`). `arrived` no se exporta.
- **Service worker:** no se registra en desarrollo. En producción va versionado por
  deploy y valida el tipo de lo que guarda. La guardia de arranque inline
  (`lib/recovery.ts`) repara sin tocar IndexedDB.

## Califica (notas hacia la plataforma)

- **Flujo principal (home → "Califica de todos los cursos"):** Diego descarga en la
  plataforma *Importar/exportar planillas por profesor GLA* → Exportar un solo `.xls`
  (19 hojas `Sheet1…Sheet19`, en desorden, una por curso). La app escribe los COD_ALUM,
  guarda los encabezados del trimestre por grado y devuelve **el mismo archivo** (.xls
  BIFF8, SheetJS) con las notas escritas por COD_ALUM (`lib/califica451.ts`). Diego lo
  importa en esa misma pantalla; confirmado que la plataforma lo acepta.
- **Regla de seguridad:** si la app tiene 0 y la plataforma ya tiene nota, se conserva
  la de la plataforma. Hojas de otro trimestre, grado o sin curso en la app quedan intactas.
- **Por curso (respaldo):** "Cargar Califica de la plataforma" en la página del curso
  (códigos + encabezados) y "Generar Califica" desde la plantilla de `public/templates`.
- **Encabezados:** cambian cada trimestre (títulos y códigos `log_31…`). La plataforma no
  es consistente con la puntuación (`T3 – C8`, `C2 - TÍTULO`); `parseAchievementDesc` lo
  tolera. Se validan contra `SLOTS_*` antes de escribir, que es posicional.
- Para validar un archivo generado: `node verificar-planilla.mjs original.xls generado.xls`
  en planilla-v2 (código 0 = sin problemas de identidad).

## Integraciones

- **planilla-v2:** el JSON de `codalum-extractor` hidrata `Student.codAlum`; la app
  exporta el JSON de `asistencia-autofill`, sin `fecha` porque la pone la plataforma;
  `verificar-planilla.mjs` compara Califica original vs generado.
- Cronograma, horario y detalle por módulo: ver `README.md`.
