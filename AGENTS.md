# Mantenimiento del perfil de JUNIORRDSR

Lee [scripts/README.md](scripts/README.md) antes de modificar imágenes del perfil.

- Los textos están en `scripts/profile.json`; las formas, posiciones y animaciones, en `scripts/templates/*.svg`.
- `assets/dark/*.svg` y `assets/light/*.svg`, salvo `stats.svg`, son resultados generados. Edita las fuentes y ejecuta `python scripts/generate_assets.py`.
- Comprueba `python scripts/generate_assets.py --check` y revisa `--preview` en ambos temas.
- Conserva el contraste, la alternativa de movimiento reducido y las etiquetas accesibles.
- Si un texto excede su ancho, ajusta el texto o la plantilla; el generador señala el problema.
- `stats.svg` se actualiza con `.github/workflows/profile-stats.yml`; sus colores y usuario vienen del mismo JSON mediante `scripts/stats_options.py`.
- La culebrita se genera con `scripts/snake.mjs` y se publica en la rama `output` desde `.github/workflows/snake.yml`.
- El contenido profesional del README y sus enlaces se editan en `README.md`; sincroniza también su texto alternativo cuando cambies datos del banner.
- Verifica fechas, cargos, estados de proyectos y credenciales con la información proporcionada por Jorge. No inventes logros ni presentes experiencia finalizada como empleo actual.
- No subas `.cache/`, entornos virtuales, fuentes descargadas ni credenciales. Incluye los SVG regenerados junto con sus fuentes en el mismo cambio.
