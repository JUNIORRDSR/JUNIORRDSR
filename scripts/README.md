# Fuentes y generación de las imágenes del perfil

Esta carpeta contiene las fuentes editables de los 30 SVG de diseño del perfil: banner, cuatro encabezados, tres botones, seis tarjetas de proyectos y pie de página, en los temas claro y oscuro.

## Instalación y uso

Requisitos: Python 3.10 o posterior. Node.js 22 para la culebrita.

Desde la raíz del repositorio:

```sh
python -m pip install -r scripts/requirements.txt
python scripts/generate_assets.py
python scripts/generate_assets.py --check
python scripts/generate_assets.py --preview
```

Los comandos sirven en Windows, Linux y macOS. En Windows también puedes usar `py` en lugar de `python`. El script resuelve las rutas desde su propia ubicación.

La primera ejecución descarga las fuentes IBM Plex desde una revisión fija de Google Fonts y comprueba su SHA-256. Las guarda en `.cache/profile-fonts/`; las ejecuciones siguientes pueden funcionar sin conexión:

```sh
python scripts/generate_assets.py --check --offline
```

`--preview` imprime la ruta de una galería HTML local con ambos temas. Ábrela en tu navegador. Puedes generar una copia de prueba en otro directorio:

```sh
python scripts/generate_assets.py --output .cache/svg-prueba --preview
```

## Qué editar

| Archivo | Para qué sirve |
|---|---|
| `profile.json` | Usuario, nombre, revisión, ubicación, textos de cada imagen y paletas |
| `templates/banner.svg` | Composición del banner, figura isométrica y animaciones |
| `templates/h-*.svg` | Encabezados de secciones |
| `templates/btn-*.svg` | Botones e iconos de contacto |
| `templates/card-*.svg` | Tarjetas de proyectos, incluidos los que no se muestran actualmente en el README |
| `templates/footer.svg` | Pie de página |
| `generate_assets.py` | Sustitución de campos, conversión tipográfica, validación y galería |
| `fonts.json` | URL fijada y SHA-256 de cada fuente |
| `requirements.txt` | Versión del conversor tipográfico |
| `stats_options.py` | Opciones de las tarjetas de estadísticas a partir del JSON |
| `snake.mjs` | Generador y autoprueba de la culebrita de contribuciones |

El generador lee las plantillas; no necesita SVG existentes en `assets/`. El texto permanece legible en las fuentes y se convierte en trazos al exportar, para que el resultado se vea igual sin instalar fuentes en el navegador.

## Actualizar un texto, una fecha o un color

1. Edita el campo correspondiente en `profile.json`. Por ejemplo, el período laboral está en `assets.banner.texts.experience_period` y el año de inicio de estudios en `assets.banner.texts.university`.
2. Actualiza `profile.revision` cuando corresponda. Ajusta también la descripción accesible `assets.banner.alt` y el texto alternativo del banner en el README si cambian los datos.
3. Regenera, comprueba y revisa la galería en ambos temas.
4. Sube las fuentes y los SVG resultantes juntos.

Los colores están en `themes.dark` y `themes.light`. Las estadísticas también usan esas paletas; para refrescarlas inmediatamente, ejecuta su workflow desde la pestaña Actions de GitHub.

## Modificar el diseño o añadir una imagen

Las plantillas son SVG normales con campos como `{{profile.name}}`, `{{asset.texts.title}}` o `{{palette.accent}}`. El reemplazo se hace sobre el árbol XML, por lo que textos con `&` o `<` se escapan correctamente.

Los nodos `<text>` admiten:

- `font-family`: `sans.ttf`, `mono.ttf`, `mono-medium.ttf` o `display.ttf`.
- `font-size`, `x`, `y` y `text-anchor`: tamaño, posición y alineación.
- `data-max-width`: ancho permitido en píxeles. Si se excede, la generación falla antes de escribir archivos.
- `data-overflow="ellipsis"`: acorta referencias largas con puntos suspensivos; conserva el texto completo en su etiqueta accesible.

Para añadir una tarjeta, copia una plantilla `card-*.svg` con un nombre nuevo y añade una entrada con ese mismo nombre, sin la extensión, en `assets` dentro del JSON. El generador la incluye en ambos temas. Añade después sus imágenes y enlace al README si quieres mostrarlas.

Mantén los estilos `prefers-reduced-motion` y las etiquetas accesibles al cambiar animaciones. Los trazos de dibujos e iconos siguen siendo SVG editables.

## Estadísticas y culebrita

`assets/*/stats.svg` procede de [GitHub Readme Stats Action](https://github.com/stats-organization/github-readme-stats-action), ejecutado diariamente por [profile-stats.yml](../.github/workflows/profile-stats.yml). No se genera con el conversor de las plantillas. Usa el token de Actions para estadísticas públicas y conserva las últimas tarjetas si falla la consulta.

Puedes ver las opciones localmente:

```sh
python scripts/stats_options.py --theme dark
python scripts/stats_options.py --theme light
```

La culebrita se genera diariamente con [snake.yml](../.github/workflows/snake.yml) y se publica en la rama `output`. Su código está aquí, fuera de `.github`:

```sh
node scripts/snake.mjs --test
```

Para generarla con datos reales, define `GITHUB_TOKEN` en el entorno y ejecuta `node scripts/snake.mjs JUNIORRDSR dist`. No guardes el token en archivos del repositorio.

El texto animado de especialidades y la tarjeta de racha se sirven por servicios externos enlazados en el README; sus URLs siguen siendo su configuración. El contador de visitas también es externo.

## Comprobación automática

[validate-assets.yml](../.github/workflows/validate-assets.yml) instala las dependencias en Linux, verifica que los SVG coincidan con sus fuentes y ejecuta la autoprueba de la culebrita. Un cambio de plantilla o JSON requiere regenerar los SVG antes de subirlo.

Las fuentes proceden de [Google Fonts](https://github.com/google/fonts) y sus licencias OFL se incluyen en `licenses/`. No se suben los binarios descargados ni la galería local.
