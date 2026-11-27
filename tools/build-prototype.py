#!/usr/bin/env python3
"""Builds the claude.ai prototype (one self-contained HTML page) from the same files as the real app.

    python3 tools/build-prototype.py [output.html]

The page inlines theme.js, app.css and app.js and the logo. It leaves out config.js and runtime.js:
without SCOUTING_CONFIG, app.js runs in prototype mode (HOSTED is false) and uses the claude.ai
storage and sign-in instead of Supabase. Any change to the app goes into both from here.
"""
import base64, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
read = lambda name: open(os.path.join(ROOT, name), encoding='utf-8').read()

index = read('index.html')
theme = read('theme.js')
css = read('app.css')
app = read('app.js')
logo = 'data:image/svg+xml;base64,' + base64.b64encode(read('logo.svg').encode('utf-8')).decode('ascii')

if 'SCOUTING_CONFIG' in app and "typeof window.SCOUTING_CONFIG === 'object'" not in app:
    sys.exit('app.js: the HOSTED switch changed; check the prototype build')
if '</script' in app.lower() or '</style' in css.lower():
    sys.exit('app.js or app.css contains a closing tag that would end the inline block')

# The app markup of index.html: from the app container to the toasts, shown straight away (no sign-in screen).
start = index.index('<div class="app" id="app"')
end = index.index('</div>', index.index('id="toasts"')) + len('</div>')
markup = index[start:end].replace('<div class="app" id="app" hidden>', '<div class="app" id="app">')
fonts = re.search(r'<link rel="preconnect" href="https://fonts.googleapis.com">.*?display=swap">', index, re.S).group(0)
title = re.search(r'<title>.*?</title>', index).group(0)

app = app.replace('src="logo.svg"', f'src="{logo}"')
if 'logo.svg' in app:
    sys.exit('app.js: logo.svg is used somewhere the build does not replace')

page = f"""{title}
<link rel="icon" href="{logo}" type="image/svg+xml">
<script>
{theme.strip()}
</script>
{fonts}
<style>
{css.strip()}
</style>

{markup}

<script>
{app.strip()}
</script>
"""

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'prototype', 'scouting-platform.html')
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
open(out, 'w', encoding='utf-8').write(page)
print(f'{out}  {len(page.encode("utf-8")) / 1024:.0f} KB')
