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
- **La UI habla de tú** ("Importa tu Planilla", "Revisa antes de subir"), no de vos.
  Los READMEs de planilla-v2 usan voseo; la app no.
- **La UI no nombra la implementación.** Se conserva el vocabulario del colegio
  (Planilla, Califica, EFAS, ciclo, D1–D5, F/R) y se evita el del código: nada de
  Supabase, VAPID, JSON de tal script, COD_ALUM, tablas ni rutas de URL como texto.
  En pantalla es "el código del estudiante", "el servidor", "la copia".
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
- **La identidad de un estudiante es su COD_ALUM, no su nombre.** `studentSyncIdByCode`
  para las filas nuevas; `studentSyncId` (por nombre) queda para las que ya existen, que
  no pueden cambiar de clave sin volverse huérfanas. El emparejamiento al importar vive en
  `lib/studentMatch.ts`, puro y aparte de Dexie: primero por código, y por nombre solo si
  no hay. `normalizeName` ya absorbe tildes y mayúsculas; lo que el nombre NO aguanta es
  un apellido añadido o corregido, y ahí el código es lo único que sostiene la identidad.
- **Migraciones Dexie:** nunca modificar una versión existente. Siempre una versión
  nueva que repita todos los stores.
- **Borrar una fila sincronizable no la borra del servidor.** El hook `deleting`
  encola una lápida, que al subir deja la MISMA fila marcada `deleted_at`. Podar en
  local con lápidas cambia filas por lápidas sin liberar nada: para liberar de verdad
  hay que borrar del lado del servidor (ver `pruneRemoteChangeLog`). Cuando el borrado
  significa "este dispositivo ya no lo guarda" y no "esto se borró en todas partes",
  va con `withoutTombstone`.
- **`changeLog` se poda; las notas y lo archivado no.** Retención en `lib/retention.ts`:
  180 días, en local al arrancar (una vez al día) y en el servidor desde el cron de la
  tarde. `trimesterSnapshots` no se toca nunca.
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
- **Solo el dominio del colegio sincroniza.** `lib/allowedDomain.ts` avisa en el
  navegador; la puerta de verdad es la política de RLS
  (`supabase/migrations/004_dominio_institucional.sql`), porque un filtro de cliente se
  salta. El dominio se compara **completo y por la última arroba**, nunca con `like %`:
  `alguien@gla.edu.co.otrositio.com` no es del colegio. JS (`lastIndexOf('@')`) y SQL
  (`regexp_replace('^.*@','')`) leen el dominio igual, a propósito.
- **Restringir el correo NO saca los datos de ningún equipo.** La app es local-first: lo
  que hay en IndexedDB sigue ahí aunque se desactive la cuenta. Para eso está
  `wipeLocalData` (Ajustes → "Borrar los datos de este equipo"), que va con
  `withoutTombstone`: significa "este equipo ya no los guarda", no "bórralos de todos
  mis dispositivos".
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
- **Ese archivo es también el punto de partida.** Si un curso no existe, se crea con sus
  estudiantes desde la hoja (`courseFromCalificaSheet`). Es lo que permite que lo use un
  docente que no exporta la Planilla del año — o sea, todos menos Diego. Comparado con la
  Planilla, al Califica solo le faltan la asistencia histórica, las observaciones por
  ciclo y el director de grupo; y a cambio **trae el COD_ALUM, que la Planilla no**, así
  que arrancar por acá se ahorra el extractor de códigos.
- **Reimportar no puede pisar lo que el archivo no sabe.** Para un curso que ya existe, el
  director, el trimestre, `cyclesActive` y los encabezados salen del curso guardado, no
  del archivo. Las notas, observaciones y asistencia de los estudiantes las preserva
  `upsertCourseWithStudents`.
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
- **Asistencia: copiar y pegar, no archivos.** El panel del autofill recibe el JSON en
  un `<textarea>` y el selector de archivo solo lo rellena, así que el camino normal es
  copiar desde el inicio y pegar ahí — sin ZIP, sin descomprimir y sin explorador de
  archivos, y funciona igual en el celular. El ZIP sigue como respaldo para cuando no
  hay portapapeles (contexto inseguro o permiso denegado).
- **Descargar entregas de Classroom.** Reemplaza el enlace externo a classroom-rpa, que
  se quitó de la barra. El ZIP se arma **en el navegador** (no en el servidor): un curso
  completo son decenas de archivos y una función de Vercel se corta al minuto; además así
  hay avance y cancelación. `api/classroom/drive/[fileId]` solo hace de puente, porque el
  token vive en el servidor.
- **Un Documento de Google no tiene bytes que descargar:** hay que pedirle a Drive que lo
  exporte (`lib/driveExport.ts` decide a qué). Sin eso el ZIP saldría casi vacío, porque
  la mayoría de los trabajos de Classroom son Documentos.
- **Descargar trabajos necesita el permiso `drive.readonly`**, que Google considera
  restringido: al añadirlo hay que volver a dar consentimiento, y para publicarlo a muchos
  docentes haría falta la verificación de Google.
- Cronograma, horario y detalle por módulo: ver `README.md`.
