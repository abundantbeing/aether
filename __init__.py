"""Aether: living themes for Hermes Desktop.

Registers two tools (``aether_theme``, ``aether_gallery``), the ``/aether`` slash command, the RPC
methods the Desktop half syncs and edits colours through (``plugin.aether.state|ack|delete|preview``)
and one skill (``aether:theme-design``). Theme maths lives in the sibling modules; the renderer is ``desktop/plugin.js``.
"""
from __future__ import annotations

import logging
from pathlib import Path

from ._tools import GALLERY_SCHEMA, THEME_SCHEMA, Runtime

logger = logging.getLogger(__name__)

TOOLSET = "aether"


def register(ctx) -> None:
    runtime = Runtime(ctx)
    ctx.register_tool(name="aether_theme", toolset=TOOLSET, schema=THEME_SCHEMA, handler=runtime.theme_tool,
                      description=THEME_SCHEMA["description"], emoji="✨")
    ctx.register_tool(name="aether_gallery", toolset=TOOLSET, schema=GALLERY_SCHEMA, handler=runtime.gallery_tool,
                      description=GALLERY_SCHEMA["description"], emoji="✨")
    ctx.register_command("aether", runtime.command, description="Apply a living theme to Hermes Desktop",
                         args_hint="[name|off|list]")
    if hasattr(ctx, "register_rpc"):
        ctx.register_rpc("state", runtime.rpc_state)
        ctx.register_rpc("ack", runtime.rpc_ack)
        ctx.register_rpc("delete", runtime.rpc_delete)
        ctx.register_rpc("preview", runtime.rpc_preview)
    skill = Path(__file__).resolve().parent / "skills" / "theme-design" / "SKILL.md"
    if skill.exists():
        ctx.register_skill("theme-design", skill)
    logger.debug("aether: registered tools, /aether and RPC")
