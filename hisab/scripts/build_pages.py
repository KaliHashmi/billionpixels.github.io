"""Lay out the packaged previews as a static site for GitHub Pages: /hisab-uat/, /hisab-app/ and a 404 page."""
import html, os, re, shutil, sys
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

# Public pages the stores link to: /hisab/, /hisab/privacy/, /hisab/delete-data/, /hisab/support/.
SITE_PATH = os.environ.get('HISAB_SITE_PATH', '/billionpixels.github.io/hisab')
CONTACT = os.environ.get('HISAB_CONTACT_EMAIL', '')
EFFECTIVE, EFFECTIVE_AR = '2 November 2026', '٢ نوفمبر ٢٠٢٦'
mail = f'<a href="mailto:{html.escape(CONTACT)}">{html.escape(CONTACT)}</a>' if CONTACT else ''
values = {
    'BASE': SITE_PATH, 'EFFECTIVE_DATE': EFFECTIVE, 'EFFECTIVE_DATE_AR': EFFECTIVE_AR,
    'CONTACT': f'email {mail}' if CONTACT else 'use the support email shown on Hisab\'s App Store or Google Play page',
    'CONTACT_AR': f'راسلنا على {mail}' if CONTACT else 'استخدم بريد الدعم الظاهر في صفحة حساب على App Store أو Google Play',
}
site = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
os.makedirs(os.path.join(out, 'hisab'))
shutil.copy(os.path.join(site, 'site.css'), os.path.join(out, 'hisab', 'site.css'))
for name in ('index', 'privacy', 'delete-data', 'support'):
    body = open(os.path.join(site, name + '.html'), encoding='utf-8').read()
    title = re.match(r'<!-- title: (.*?) -->', body).group(1)
    body = re.sub(r'\{\{(\w+)\}\}', lambda m: values[m.group(1)], body)
    dest = os.path.join(out, 'hisab') if name == 'index' else os.path.join(out, 'hisab', name)
    os.makedirs(dest, exist_ok=True)
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title><link rel="stylesheet" href="{SITE_PATH}/site.css"></head><body>
<header><div class="wrap"><a href="{SITE_PATH}/">Hisab · حساب</a><nav><a href="{SITE_PATH}/privacy/">Privacy</a><a href="{SITE_PATH}/delete-data/">Delete data</a><a href="{SITE_PATH}/support/">Support</a></nav></div></header>
<main class="wrap">{body}</main><footer>© 2026 Hisab</footer></body></html>"""
    open(os.path.join(dest, 'index.html'), 'w', encoding='utf-8').write(page)
assert '{{' not in open(os.path.join(out, 'hisab', 'privacy', 'index.html'), encoding='utf-8').read()
print(sorted(os.listdir(out)))
