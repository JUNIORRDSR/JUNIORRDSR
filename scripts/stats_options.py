#!/usr/bin/env python3
"""Print GitHub Actions outputs, or one theme's query string, for stats cards."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]


def options(config, theme):
    palette = config["themes"][theme]
    return urlencode({
        "username": config["profile"]["github_user"],
        "show_icons": "true", "include_all_commits": "true", "hide": "contribs",
        "locale": "es", "custom_title": "Registro en GitHub", "border_radius": 0,
        "bg_color": palette["background"].lstrip("#"),
        "border_color": palette["border"].lstrip("#"),
        "title_color": palette["text"].lstrip("#"),
        "icon_color": palette["accent"].lstrip("#"),
        "text_color": palette["text"].lstrip("#"),
        "ring_color": palette["accent"].lstrip("#"),
    })


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--theme", choices=["dark", "light"])
    args = parser.parse_args()
    config = json.loads((ROOT / "scripts/profile.json").read_text(encoding="utf-8"))
    if args.theme:
        print(options(config, args.theme))
    else:
        for theme in ("dark", "light"):
            print(f"{theme}={options(config, theme)}")
