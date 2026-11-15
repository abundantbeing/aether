"""The SVG guard admits self-contained, CSS-animated drawings and nothing that loads or runs code."""
from __future__ import annotations

import pytest

from aether_plugin._svg import MAX_SVG_CHARS, SvgRejected, check_svg

GOOD = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#120a24"/>
  <stop offset="1" stop-color="#d9426b"/></linearGradient></defs>
  <style>@keyframes drift { to { transform: translateX(-200px) } } .c { animation: drift 60s ease-in-out infinite alternate }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important } }</style>
  <rect width="1600" height="1000" fill="url(#sky)"/>
  <circle class="c" cx="800" cy="420" r="160" fill="#ffe08a"><animate attributeName="r" values="160;170;160" dur="20s" repeatCount="indefinite"/></circle>
  <use href="#sky"/>
</svg>"""


def test_accepts_a_css_and_smil_animated_scene():
    assert check_svg(GOOD) == GOOD.strip()


@pytest.mark.parametrize("bad", [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="https://x/y.svg#a"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="https://example.com"><rect/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://x/y.css);</style></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill: url(https://x/p.png)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(javascript:x)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="href" to="javascript:x"/></svg>',
    '<!DOCTYPE svg [<!ENTITY a "aaaa">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>',
    '<html><body/></html>',
    '<svg><rect>',
    '',
])
def test_refuses_anything_that_loads_or_runs(bad):
    with pytest.raises(SvgRejected):
        check_svg(bad)


def test_refuses_oversized_markup():
    big = '<svg xmlns="http://www.w3.org/2000/svg">' + "<g/>" * (MAX_SVG_CHARS // 4) + "</svg>"
    with pytest.raises(SvgRejected):
        check_svg(big)
