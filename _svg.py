"""Admission check for agent-written SVG scenes.

The Desktop shows an SVG scene only as an ``<img>`` source, where the browser itself runs no script
and fetches nothing. This check is the second wall: it refuses anything that would need either, so a
scene that passes here is a self-contained drawing animated by CSS or SMIL and nothing else.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

MAX_SVG_CHARS = 131_072  # 128 KiB: plenty for a CSS-animated drawing, small enough to ship in an event

_ALLOWED_TAGS = frozenset({
    "svg", "g", "defs", "title", "desc", "style", "symbol", "use", "path", "rect", "circle", "ellipse",
    "line", "polyline", "polygon", "text", "tspan", "textPath", "lineargradient", "radialgradient",
    "stop", "pattern", "clippath", "mask", "marker", "filter", "fegaussianblur", "feoffset", "feblend",
    "fecolormatrix", "fecomposite", "femerge", "femergenode", "feflood", "feturbulence",
    "fedisplacementmap", "fecomponenttransfer", "fefunca", "fefuncr", "fefuncg", "fefuncb",
    "fedropshadow", "femorphology", "animate", "animatetransform", "animatemotion", "mpath", "set",
    "metadata",
})
_URLISH_ATTRS = frozenset({"href", "src", "action", "formaction", "xml:base", "base"})
_CSS_BANNED = re.compile(r"@import|expression\s*\(|javascript:|behavior\s*:|-moz-binding", re.I)
_CSS_URL = re.compile(r"url\(\s*(['\"]?)(.*?)\1\s*\)", re.I | re.S)


class SvgRejected(ValueError):
    """The SVG is not a self-contained, script-free drawing."""


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _check_css(text: str, where: str) -> None:
    if _CSS_BANNED.search(text):
        raise SvgRejected(f"{where} uses a CSS construct that loads or runs something")
    for match in _CSS_URL.finditer(text):
        if not match.group(2).strip().startswith("#"):
            raise SvgRejected(f"{where} references an external url(); only url(#id) is allowed")


def check_svg(source: object) -> str:
    """Return the SVG text unchanged when it is safe to show; raise :class:`SvgRejected` otherwise."""
    if not isinstance(source, str) or not source.strip():
        raise SvgRejected("scene.svg must be the SVG markup as a string")
    text = source.strip()
    if len(text) > MAX_SVG_CHARS:
        raise SvgRejected(f"SVG is {len(text):,} characters; the limit is {MAX_SVG_CHARS:,}")
    lowered = text.lower()
    if "<!doctype" in lowered or "<!entity" in lowered:
        raise SvgRejected("DOCTYPE and ENTITY declarations are not allowed")
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise SvgRejected(f"not well-formed XML ({exc})") from None
    if _local(root.tag) != "svg":
        raise SvgRejected("the root element must be <svg>")

    for element in root.iter():
        tag = _local(element.tag)
        if tag not in _ALLOWED_TAGS:
            raise SvgRejected(f"<{tag}> is not allowed in a scene (no script, foreignObject, image or links)")
        for name, value in element.attrib.items():
            attr = _local(name)
            if attr.startswith("on"):
                raise SvgRejected(f"event handler attribute {attr!r} on <{tag}> is not allowed")
            if attr in _URLISH_ATTRS and not value.strip().startswith("#"):
                raise SvgRejected(f"{attr}={value[:40]!r} on <{tag}> must point inside the SVG (#id)")
            if attr == "style":
                _check_css(value, f"style on <{tag}>")
            elif "url(" in value.lower():
                _check_css(value, f"{attr} on <{tag}>")
            if tag in ("animate", "set", "animatetransform") and attr == "attributename" and \
                    _local(value).lower() in _URLISH_ATTRS:
                raise SvgRejected("animating href is not allowed")
        if tag == "style" and element.text:
            _check_css(element.text, "<style>")
    return text
