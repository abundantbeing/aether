"""Themes from other creators: which installed plugin made a Desktop theme, and who made the plugin."""
from __future__ import annotations

import importlib.util
import json
import sys

import pytest

from conftest import ROOT

PNG = bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010806000000")


def _module():
    name = "aether_plugin._community"
    if name not in sys.modules:
        spec = importlib.util.spec_from_file_location(name, ROOT / "_community.py")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return sys.modules[name]


@pytest.fixture
def community(home, monkeypatch):
    module = _module()
    module._cache.clear()
    monkeypatch.setattr(module, "_home", lambda: home)
    monkeypatch.setattr(module, "_cli_skins", lambda: {"default", "ares"})
    return module


def _plugin(home, folder, *, manifest=None, script=None, files=None):
    root = home / "plugins" / folder
    (root / "desktop").mkdir(parents=True)
    if manifest is not None:
        (root / "plugin.yaml").write_text(manifest, encoding="utf-8")
    if script is not None:
        (root / "desktop" / "plugin.js").write_text(script, encoding="utf-8")
    for rel, data in (files or {}).items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data if isinstance(data, bytes) else data.encode("utf-8"))
    return root


BOREALIS_JS = """import { THEMES_AREA } from '@hermes/plugin-sdk'
const NAME = 'borealis'
const THEME = { name: NAME, label: 'Borealis', colors: {} }
export default { register(ctx) { ctx.register({ id: NAME, area: THEMES_AREA, data: THEME }) } }
"""


def test_a_theme_plugin_is_credited_to_its_manifest_author_with_its_banner(community, home):
    _plugin(home, "hermes-borealis", manifest="name: hermes-borealis\nauthor: Adolanium\nversion: '0.2.2'\n",
            script=BOREALIS_JS, files={"assets/catalog-banner.png": PNG})
    (home / "plugins" / ".install-metadata.json").write_text(json.dumps(
        {"hermes-borealis": {"source": "https://github.com/Adolanium/hermes-borealis.git"}}))

    out = community.attribute(["borealis", "borealis-accent-ff6a00", "my-imported-theme"])

    assert out["themes"] == {"borealis": "hermes-borealis", "borealis-accent-ff6a00": "hermes-borealis"}
    plugin = out["plugins"]["hermes-borealis"]
    assert plugin["author"] == "Adolanium"
    assert plugin["repo"] == "https://github.com/Adolanium/hermes-borealis"
    assert plugin["image"].startswith("data:image/png;base64,")
    assert "_script" not in plugin


def test_with_no_author_the_repo_owner_is_the_creator(community, home):
    _plugin(home, "glow", manifest="name: glow\n", script=BOREALIS_JS.replace("borealis", "glow"))
    (home / "plugins" / ".install-metadata.json").write_text(json.dumps(
        {"glow": {"source": "git@github.com:someone/hermes-glow.git"}}))

    out = community.attribute(["glow"])

    assert out["plugins"]["glow"]["author"] == "someone"
    assert out["plugins"]["glow"]["repo"] == "https://github.com/someone/hermes-glow"


def test_plugins_that_register_no_themes_and_cli_skins_are_left_out(community, home):
    _plugin(home, "notes", manifest="name: notes\nauthor: x\n", script="const NAME = 'borealis'\n")
    _plugin(home, "skinny", manifest="name: skinny\n", script=BOREALIS_JS.replace("borealis", "ares"))

    assert community.attribute(["borealis", "ares"]) == {"themes": {}, "plugins": {}}


def test_aether_itself_is_never_listed(community, home):
    _plugin(home, "aether", manifest="name: aether\nauthor: abundantbeing\n",
            script=BOREALIS_JS.replace("borealis", "aether-olympus"))

    assert community.attribute(["aether-olympus"])["themes"] == {}


def test_the_readme_image_is_used_when_there_is_no_banner_and_paths_stay_inside_the_plugin(community, home, tmp_path):
    outside = tmp_path / "secret.png"
    outside.write_bytes(PNG)
    _plugin(home, "dawn", manifest="name: dawn\nauthor: a\n", script=BOREALIS_JS.replace("borealis", "dawn"),
            files={"README.md": "![x](../../secret.png)\n<img src=\"media/shot.png\">\n", "media/shot.png": PNG})

    image = community.attribute(["dawn"])["plugins"]["dawn"]["image"]

    assert image.startswith("data:image/png;base64,")
    plugin_only = _plugin(home, "dusk", manifest="name: dusk\n", script=BOREALIS_JS.replace("borealis", "dusk"),
                          files={"README.md": "![x](../../../secret.png)\n"})
    assert plugin_only.exists()
    assert community.attribute(["dusk"])["plugins"]["dusk"]["image"] == ""


def test_a_name_both_plugins_mention_goes_to_the_one_named_after_it(community, home):
    _plugin(home, "aurora-pack", manifest="name: aurora-pack\nauthor: b\n",
            script=BOREALIS_JS + "\nconst other = 'borealis'\n")
    _plugin(home, "hermes-borealis", manifest="name: hermes-borealis\nauthor: Adolanium\n", script=BOREALIS_JS)

    assert community.attribute(["borealis"])["themes"] == {"borealis": "hermes-borealis"}


def test_bad_input_is_ignored(community, home):
    assert community.attribute(None) == {"themes": {}, "plugins": {}}
    assert community.attribute(["x" * 500]) == {"themes": {}, "plugins": {}}


def test_manifests_are_read_without_pyyaml(community, home, monkeypatch):
    # A bare Hermes install has no PyYAML; credits must still come from the manifest.
    monkeypatch.setitem(sys.modules, "yaml", None)
    _plugin(home, "hermes-borealis", manifest="name: hermes-borealis\nauthor: Adolanium\n", script=BOREALIS_JS)
    assert community._manifest(home / "plugins" / "hermes-borealis")["author"] == "Adolanium"
