#!/usr/bin/env python3
"""Build the profile SVGs from editable templates and profile.json."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import sys
from urllib.request import urlopen
import xml.etree.ElementTree as ET

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
NS = "http://www.w3.org/2000/svg"
TOKEN = re.compile(r"\{\{([a-zA-Z0-9_.]+)\}\}")
IDENTIFIER = re.compile(r"^[a-z0-9-]+$")
ET.register_namespace("", NS)


def substitute(value: str, context: dict) -> str:
    def resolve(match):
        current = context
        for key in match.group(1).split("."):
            current = current[key]
        return str(current)
    return TOKEN.sub(resolve, value)


def load_fonts(offline: bool) -> dict:
    manifest = json.loads((ROOT / "scripts/fonts.json").read_text(encoding="utf-8"))
    cache = ROOT / ".cache/profile-fonts"
    cache.mkdir(parents=True, exist_ok=True)
    fonts = {}
    for filename, spec in manifest.items():
        if Path(filename).name != filename:
            raise ValueError(f"Nombre de fuente inválido: {filename}")
        path = cache / filename
        if not path.exists():
            if offline:
                raise ValueError(f"Falta {path}. Ejecuta primero sin --offline.")
            with urlopen(spec["url"], timeout=30) as response:
                data = response.read()
            if hashlib.sha256(data).hexdigest() != spec["sha256"]:
                raise ValueError(f"SHA-256 incorrecto al descargar {filename}")
            path.write_bytes(data)
        if hashlib.sha256(path.read_bytes()).hexdigest() != spec["sha256"]:
            raise ValueError(f"La fuente {path} cambió. Borra ese archivo y repite.")
        font = TTFont(path)
        if "fvar" in font:
            font = instantiateVariableFont(font, {"wght": 400, "wdth": 100})
        fonts[filename] = font
    return fonts


def outline_text(node: ET.Element, fonts: dict) -> ET.Element:
    original = node.text or ""
    text = original
    family = node.get("font-family", "mono.ttf")
    font = fonts[family]
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = float(node.get("font-size", "11")) / font["head"].unitsPerEm

    def width(value):
        try:
            return sum(glyphs[cmap[ord(char)]].width for char in value) * scale
        except KeyError as error:
            raise ValueError(f"Carácter sin glifo en {family}: {value!r}") from error

    limit = float(node.get("data-max-width", "inf"))
    if width(text) > limit:
        if node.get("data-overflow") != "ellipsis":
            raise ValueError(f"Texto demasiado ancho ({width(text):.1f} > {limit:g}px): {text!r}")
        while text and width(text + "…") > limit:
            text = text[:-1]
        text = text + "…"
        if width(text) > limit:
            raise ValueError("El ancho disponible no admite una elipsis.")
    x, y = float(node.get("x", "0")), float(node.get("y", "0"))
    anchor = node.get("text-anchor", "start")
    if anchor == "end":
        x -= width(text)
    elif anchor == "middle":
        x -= width(text) / 2
    pen = SVGPathPen(glyphs, ntos=lambda number: f"{number:.1f}".rstrip("0").rstrip("."))
    for char in text:
        glyph = glyphs[cmap[ord(char)]]
        glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, x, y)))
        x += glyph.width * scale
    attributes = {key: value for key, value in node.attrib.items()
                  if key not in {"x", "y", "font-family", "font-size", "text-anchor"}
                  and not key.startswith("data-")}
    attributes.update({"d": pen.getCommands(), "aria-label": original})
    path = ET.Element(f"{{{NS}}}path", attributes)
    path.tail = node.tail
    return path


def render(template: Path, context: dict, fonts: dict) -> str:
    root = ET.parse(template).getroot()
    for node in root.iter():
        node.attrib.update({key: substitute(value, context) for key, value in node.attrib.items()})
        if node.text:
            node.text = substitute(node.text, context)
    for parent in list(root.iter()):
        for index, child in enumerate(list(parent)):
            if child.tag == f"{{{NS}}}text":
                parent.remove(child)
                parent.insert(index, outline_text(child, fonts))
    source = ET.tostring(root, encoding="unicode") + "\n"
    if TOKEN.search(source):
        raise ValueError(f"Campo sin resolver en {template.name}")
    ET.fromstring(source)
    return source


def build(config: dict, fonts: dict) -> dict[str, str]:
    if not config["assets"] or not config["themes"]:
        raise ValueError("Debe haber al menos una plantilla y un tema.")
    result = {}
    for theme, palette in config["themes"].items():
        if not IDENTIFIER.fullmatch(theme):
            raise ValueError(f"Nombre de tema inválido: {theme}")
        for slug, asset in config["assets"].items():
            if not IDENTIFIER.fullmatch(slug):
                raise ValueError(f"Nombre de SVG inválido: {slug}")
            context = {"profile": config["profile"], "palette": palette, "asset": asset}
            result[f"{theme}/{slug}.svg"] = render(ROOT / "scripts/templates" / f"{slug}.svg", context, fonts)
    return result


def preview(output: Path, generated: dict[str, str]) -> Path:
    page = ROOT / ".cache/profile-preview/index.html"
    page.parent.mkdir(parents=True, exist_ok=True)
    content = ['<!doctype html><html lang="es"><meta charset="utf-8">',
               '<title>Vista previa del perfil</title>',
               '<style>body{margin:0;font:16px system-ui}section{padding:24px}',
               'section.dark{background:#0d1117;color:#e6edf3}',
               'section.light{background:#fff;color:#1f2328}',
               '.gallery{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0}',
               'img{display:block;max-width:100%;height:auto}figcaption{margin:8px 0 20px}',
               '@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style>']
    for theme in sorted({key.split("/")[0] for key in generated}):
        content.append(f'<section class="{html.escape(theme)}"><h1>{html.escape(theme)}</h1><div class="gallery">')
        for key in generated:
            if key.startswith(theme + "/"):
                url = (output / key).resolve().as_uri()
                label = html.escape(Path(key).name)
                content.append(f'<figure><img src="{html.escape(url, quote=True)}" alt="{label}"><figcaption>{label}</figcaption></figure>')
        content.append("</div></section>")
    content.append("</html>")
    page.write_bytes("\n".join(content).encode("utf-8"))
    return page


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=ROOT / "scripts/profile.json")
    parser.add_argument("--output", type=Path, default=ROOT / "assets")
    parser.add_argument("--check", action="store_true", help="Compara con los SVG existentes sin escribirlos.")
    parser.add_argument("--preview", action="store_true", help="Genera una galería local de ambos temas.")
    parser.add_argument("--offline", action="store_true", help="Usa solo fuentes ya descargadas y verificadas.")
    args = parser.parse_args(argv)
    if args.check and args.preview:
        parser.error("--check y --preview se usan por separado.")
    try:
        config = json.loads(args.config.read_text(encoding="utf-8"))
        generated = build(config, load_fonts(args.offline))
        if args.check:
            outdated = [key for key, source in generated.items()
                        if not (args.output / key).is_file()
                        or (args.output / key).read_bytes() != source.encode("utf-8")]
            if outdated:
                print("SVG sin regenerar: " + ", ".join(outdated), file=sys.stderr)
                return 1
            print(f"{len(generated)} SVG comprobados.")
        else:
            # Render everything successfully before writing any output.
            for key, source in generated.items():
                path = args.output / key
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(source.encode("utf-8"))
            print(f"{len(generated)} SVG generados en {args.output.resolve()}")
            if args.preview:
                print(f"Vista previa: {preview(args.output, generated)}")
        return 0
    except (KeyError, ValueError, OSError, ET.ParseError) as error:
        print(f"No se pudo generar el perfil: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
