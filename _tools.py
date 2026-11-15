"""Agent tools, Desktop RPC methods and the /aether slash command.

Delivery: a theme reaches the Desktop window that is viewing the chat through ``ctx.emit_to_session``
(``plugin.aether.theme``). When nobody is viewing (the request came from a messaging app, or the
window is closed) the theme is saved and parked in the ``pending`` slot instead; the next Desktop to
sync over ``plugin.aether.state`` applies it once and acknowledges it.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any, Dict, List, Optional

from . import _store as store
from ._spec import ENGINES, FINISHES, FONTS, PATTERNS, SpecError, normalize, slugify

logger = logging.getLogger(__name__)

EVENT = "theme"
SKILL = "aether:theme-design"

_HEX = {"type": "string", "description": "hex colour like #0b1020"}

THEME_SCHEMA: Dict[str, Any] = {
    "name": "aether_theme",
    "description": (
        "Restyle Hermes Desktop: create a living theme (colour palette plus an animated background behind "
        "the chat) and apply it. The background is a shader scene with an optional dither, halftone or "
        "ascii finish. Use it whenever the user asks to change how Hermes looks, its background, colours, mood or vibe. "
        "Choose colours and a scene that match the request; the plugin derives the rest of the palette, "
        "keeps text readable and reports each adjustment, which you should mention briefly. Calm beats "
        "busy: big slow shapes, a quiet centre. Reusing a name replaces that theme. For a hand-drawn "
        f"scene (engine \"svg\") or design advice, load the skill {SKILL} first."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Short title shown in the theme picker, e.g. \"Sunset Dither\""},
            "description": {"type": "string", "description": "One line describing the look (optional)"},
            "background": {**_HEX, "description": "Base surface colour; a dark one makes a dark theme"},
            "accent": {**_HEX, "description": "Brand/accent colour for buttons, focus rings, highlights"},
            "foreground": {**_HEX, "description": "Text colour (optional; derived from the background)"},
            "secondary": {**_HEX, "description": "Second accent, tints your chat bubbles (optional)"},
            "scene": {
                "type": "object",
                "description": "The animated backdrop",
                "properties": {
                    "engine": {"type": "string", "enum": list(ENGINES),
                               "description": "; ".join(f"{k}: {v[0]}" for k, v in ENGINES.items())},
                    "colors": {"type": "array", "items": {"type": "string"}, "minItems": 2, "maxItems": 5,
                               "description": "2-5 hex stops from calm (usually the background) to brightest"},
                    "speed": {"type": "number", "description": "0-3, 1 = default pace, 0 = still"},
                    "scale": {"type": "number", "description": "0.25-4, size of features (higher = bigger)"},
                    "intensity": {"type": "number", "description": "0.05-1, how far the scene climbs the colour stops"},
                    "density": {"type": "number", "description": "0-1, how many stars/sparks/lines/nodes"},
                    "direction": {"type": "number", "description": "degrees, for flowing engines"},
                    "svg": {"type": "string", "description": "engine svg only: full <svg> markup animated with CSS"},
                },
            },
            "finish": {
                "type": "object",
                "description": "How the scene is printed",
                "properties": {
                    "style": {"type": "string", "enum": list(FINISHES),
                              "description": "; ".join(f"{k}: {v}" for k, v in FINISHES.items())},
                    "pixel": {"type": "integer", "description": "dither/pixel size or halftone/ascii cell, in px"},
                    "levels": {"type": "integer", "description": "dither: colour levels, 0 = one per scene colour"},
                    "pattern": {"type": "string", "enum": list(PATTERNS)},
                },
            },
            "glass": {
                "type": "object",
                "description": "Readability veil over the scene (raised automatically when needed)",
                "properties": {
                    "tint": {"type": "number", "description": "0-0.95, how much theme colour covers the scene"},
                    "focus": {"type": "number", "description": "0-0.9, extra calm behind the conversation column"},
                },
            },
            "font": {"type": "string", "enum": list(FONTS), "description": "UI font (optional)"},
            "apply": {"type": "boolean", "description": "Apply now (default true); false only saves it"},
        },
        "required": ["name", "background", "accent"],
    },
}

GALLERY_SCHEMA: Dict[str, Any] = {
    "name": "aether_gallery",
    "description": (
        "Browse or apply Hermes Desktop theme presets and saved themes, or turn the animated background "
        "off: list the Aether presets and themes made with aether_theme, apply one by name, delete a "
        "saved one, or switch the backdrop off and return to the previous theme."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["list", "apply", "off", "delete"]},
            "name": {"type": "string", "description": "Theme name or slug, for apply and delete"},
        },
        "required": ["action"],
    },
}


@lru_cache(maxsize=1)
def _presets() -> tuple:
    from ._presets import preset_records

    return tuple(preset_records())


def _catalog() -> List[Dict[str, Any]]:
    return list(_presets()) + store.list_themes()


def resolve(name: str) -> Optional[Dict[str, Any]]:
    """A preset or saved theme by slug, by ``aether-`` + slug, or by its label (case-insensitive)."""
    wanted = (name or "").strip()
    if not wanted:
        return None
    candidates = {wanted.lower(), slugify(wanted)}
    if not wanted.lower().startswith("aether-"):
        candidates.add("aether-" + wanted.lower())
    for record in store.list_themes() + list(_presets()):
        if record["slug"] in candidates or record["label"].lower() == wanted.lower():
            return record
    return None


def _brief(record: Dict[str, Any]) -> Dict[str, Any]:
    scene = record["scene"]
    return {
        "name": record["label"],
        "slug": record["slug"],
        "kind": "preset" if record.get("source") == "preset" else "saved",
        "look": record["description"],
        "appearance": record["appearance"],
        "engine": scene["engine"],
        "finish": scene["finish"]["style"],
    }


class Runtime:
    """Holds the plugin context so handlers can reach the session that asked."""

    def __init__(self, ctx: Any) -> None:
        self.ctx = ctx

    # ── delivery ──────────────────────────────────────────────────────────────────────────────

    def deliver(self, payload: Dict[str, Any], session_id: str = "") -> str:
        """``"live"`` when a Desktop viewing *session_id* took the event, else ``"pending"``."""
        delivered = False
        if session_id:
            try:
                delivered = bool(self.ctx.emit_to_session(session_id, EVENT, payload))
            except Exception:  # an older or headless host: fall back to the pending slot
                logger.debug("aether: emit_to_session failed", exc_info=True)
        if delivered:
            return "live"
        record = payload.get("record") or {}
        store.set_pending(payload["action"], record.get("slug"))
        return "pending"

    @staticmethod
    def _where(status: str) -> str:
        if status == "live":
            return "Applied in the Hermes Desktop window viewing this chat."
        return ("Saved. No Hermes Desktop window is viewing this chat, so Hermes Desktop will apply it "
                "the next time it connects to this profile.")

    # ── tools ─────────────────────────────────────────────────────────────────────────────────

    def theme_tool(self, args: Dict[str, Any], **kwargs: Any) -> str:
        try:
            record = normalize(args, source="agent")
        except SpecError as exc:
            return json.dumps({"ok": False, "error": str(exc), "hint": f"Fix the field and call again; see {SKILL}."})
        adjustments = record["adjustments"]
        saved = store.save(record)
        result: Dict[str, Any] = {
            "ok": True,
            "theme": record["label"],
            "slug": record["slug"],
            "appearance": record["appearance"],
            "scene": f"{record['scene']['engine']} / {record['scene']['finish']['style']}",
            "adjustments": adjustments,
        }
        if args.get("apply", True) is False:
            result["status"] = "saved"
            result["note"] = "Saved without applying. It is listed in the theme picker and aether_gallery."
            return json.dumps(result)
        status = self.deliver({"action": "apply", "record": saved, "origin": "agent"}, kwargs.get("session_id") or "")
        result["status"] = status
        result["note"] = self._where(status)
        if status == "live":
            result["preview_card"] = (f"::aether-theme{{name=\"{record['slug']}\"}}  (optional: end your reply "
                                      "with this line on its own to show a live preview card with Keep and Undo)")
        return json.dumps(result)

    def gallery_tool(self, args: Dict[str, Any], **kwargs: Any) -> str:
        action = str(args.get("action") or "list").strip().lower()
        session_id = kwargs.get("session_id") or ""
        if action == "list":
            return json.dumps({"ok": True, "themes": [_brief(r) for r in _catalog()]})
        if action == "off":
            status = self.deliver({"action": "off"}, session_id)
            return json.dumps({"ok": True, "status": status, "note": (
                "Backdrop off; Hermes Desktop returned to the previous theme." if status == "live"
                else "Hermes Desktop will turn the backdrop off the next time it connects.")})
        record = resolve(str(args.get("name") or ""))
        if record is None:
            names = ", ".join(r["label"] for r in _catalog())
            return json.dumps({"ok": False, "error": f"No theme called {args.get('name')!r}. Available: {names}"})
        if action == "delete":
            if record.get("source") == "preset":
                return json.dumps({"ok": False, "error": "Presets ship with the plugin and cannot be deleted."})
            store.delete(record["slug"])
            return json.dumps({"ok": True, "deleted": record["label"]})
        if action == "apply":
            status = self.deliver({"action": "apply", "record": record, "origin": "agent"}, session_id)
            return json.dumps({"ok": True, "theme": record["label"], "status": status, "note": self._where(status)})
        return json.dumps({"ok": False, "error": f"Unknown action {action!r}; use list, apply, off or delete."})

    # ── RPC for the Desktop half ──────────────────────────────────────────────────────────────

    def rpc_state(self, params: Any = None, **kwargs: Any) -> Dict[str, Any]:
        return {"schema": 1, "themes": store.list_themes(), "pending": store.pending()}

    def rpc_ack(self, params: Any = None, **kwargs: Any) -> Dict[str, Any]:
        pending_id = (params or {}).get("id") if isinstance(params, dict) else None
        return {"ok": bool(pending_id) and store.clear_pending(str(pending_id))}

    def rpc_delete(self, params: Any = None, **kwargs: Any) -> Dict[str, Any]:
        slug = (params or {}).get("slug") if isinstance(params, dict) else None
        return {"ok": bool(slug) and store.delete(str(slug))}

    # ── /aether ───────────────────────────────────────────────────────────────────────────────

    def command(self, raw_args: str = "", **kwargs: Any) -> str:
        arg = (raw_args or "").strip()
        session_id = kwargs.get("session_id") or ""
        if arg.lower() in ("list", "ls"):
            lines = [f"  {r['label']:<16} {r['description']}" for r in _catalog()]
            return "Aether themes (apply with /aether <name>, or /aether off):\n" + "\n".join(lines)
        if not arg:
            choices = [{"value": r["slug"], "label": r["label"], "description": r["description"]} for r in _catalog()]
            choices.append({"value": "off", "label": "Off", "description": "Back to the previous theme"})
            picked = self.ctx.ask_choice("Pick a living theme", choices) if hasattr(self.ctx, "ask_choice") else None
            if not picked:
                return "Usage: /aether <name> | /aether off | /aether list. Or just ask Hermes for the look you want."
            arg = picked
        if arg.lower() == "off":
            status = self.deliver({"action": "off"}, session_id)
            return "Aether backdrop off." if status == "live" else "Hermes Desktop will turn the backdrop off when it connects."
        record = resolve(arg)
        if record is None:
            return f"No Aether theme called {arg!r}. Try /aether list."
        status = self.deliver({"action": "apply", "record": record, "origin": "command"}, session_id)
        return f"Aether: {record['label']}. " + self._where(status)
