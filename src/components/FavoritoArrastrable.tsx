/**
 * El botón que se arrastra a la barra de favoritos.
 *
 * Va con `dangerouslySetInnerHTML` y no como un `<a href={url}>` normal, y no
 * es por capricho: **React 19 bloquea los `href` que empiezan por
 * `javascript:`** y los reemplaza por un `throw`. Comprobado en esta app — el
 * enlace escrito de la forma normal sale con
 * `href="javascript:throw new Error('React has blocked a javascript: URL…')"`,
 * que se arrastra igual de bien y no hace nada.
 *
 * El bloqueo es una buena defensa contra meter en un enlace algo que venga de
 * quien visita la página. Acá el contenido es un script del repositorio del
 * propio docente, traído al compilar, y el enlace ES el producto: sin
 * `javascript:` no hay favorito que arrastrar.
 *
 * Se escapan igual las comillas y los signos de menor: el texto ya viene
 * codificado con `encodeURIComponent` y no debería traerlos, pero el escape
 * cuesta una línea y es lo que hace que esto no dependa de esa suposición.
 */
const escapar = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function FavoritoArrastrable({ url, boton }: { url: string; boton: string }) {
  const html =
    `<a class="favorito-arrastrable" href="${escapar(url)}">${escapar(boton)}</a>`;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
