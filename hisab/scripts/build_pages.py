"""Lay out the packaged previews as a static site for GitHub Pages: /hisab-uat/, /hisab-app/ and a 404 page."""
import os, shutil, sys
out = sys.argv[1]
shutil.rmtree(out, ignore_errors=True)
HEAD = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>body{margin:0}</style></head><body>'
for src, name in (('out-uat', 'hisab-uat'), ('out-production', 'hisab-app')):
    os.makedirs(os.path.join(out, name, 'js'))
    page = open(os.path.join(src, 'index.html'), encoding='utf-8').read()
    open(os.path.join(out, name, 'index.html'), 'w', encoding='utf-8').write(HEAD + page + '</body></html>')
    shutil.copy(os.path.join(src, 'js', 'hisab.js'), os.path.join(out, name, 'js', 'hisab.js'))
# Reloading a deep link inside the app lands on 404.html: it boots the app, which then shows that screen.
app = open(os.path.join('out-production', 'index.html'), encoding='utf-8').read().replace('<title>Hisab</title>', '<title>Hisab</title>')
guard = '<script>if (!/\\/hisab-(uat|app)(\\/|$)/.test(location.pathname)) document.write("<p style=\\"font:16px system-ui;margin:40px\\">Page not found.</p>");</script>'
open(os.path.join(out, '404.html'), 'w', encoding='utf-8').write(HEAD + guard + app + '</body></html>')
print(sorted(os.listdir(out)))
