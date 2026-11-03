"""Lay out the packaged previews as a static site for GitHub Pages: /hisab-uat/, /hisab-app/ and a 404 page."""
import html, json, os, re, shutil, sys
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

# Public pages the stores link to: /hisab/, /hisab/terms/, /hisab/privacy/, /hisab/delete-data/, /hisab/support/, /hisab/licenses/.
SITE_PATH = os.environ.get('HISAB_SITE_PATH', '/billionpixels.github.io/hisab')
CONTACT = os.environ.get('HISAB_CONTACT_EMAIL', '')
CR = os.environ.get('HISAB_CR_NUMBER', '')  # Commercial Registration number, shown with the business details once known.
# Keep in step with TERMS_VERSION in src/domain/legal.ts: a new date makes the app ask for acceptance again.
EFFECTIVE, EFFECTIVE_AR = '3 November 2026', '٣ نوفمبر ٢٠٢٦'
mail = f'<a href="mailto:{html.escape(CONTACT)}">{html.escape(CONTACT)}</a>' if CONTACT else ''
values = {
    'BASE': SITE_PATH, 'EFFECTIVE_DATE': EFFECTIVE, 'EFFECTIVE_DATE_AR': EFFECTIVE_AR,
    'CONTACT': f'email {mail}' if CONTACT else 'use the support email shown on Hisab\'s App Store or Google Play page',
    'CONTACT_AR': f'راسلنا على {mail}' if CONTACT else 'استخدم بريد الدعم الظاهر في صفحة حساب على App Store أو Google Play',
    'PUBLISHER': 'FutureX Technical Solutions', 'PUBLISHER_AR': 'فيوتشر اكس للحلول التقنية',
    'ADDRESS': 'Al Wizarat, Bausher, Muscat Governorate, Sultanate of Oman', 'ADDRESS_AR': 'حي الوزارات، بوشر، محافظة مسقط، سلطنة عُمان',
    'CR': f'<br>Commercial Registration No. {html.escape(CR)}' if CR else '', 'CR_AR': f'<br>السجل التجاري رقم {html.escape(CR)}' if CR else '',
}

def licenses_page(app_dir):
    """Open-source notices for every package the app ships (production dependencies in package-lock.json), with each licence text."""
    lock = json.load(open(os.path.join(app_dir, 'package-lock.json'), encoding='utf-8'))
    rows, texts = [], {}
    for path, info in sorted(lock['packages'].items()):
        if not path or info.get('dev') or info.get('devOptional'):
            continue
        name = path.split('node_modules/')[-1]
        pkg_dir = os.path.join(app_dir, path)
        lic = info.get('license')
        if not lic and os.path.exists(os.path.join(pkg_dir, 'package.json')):
            lic = json.load(open(os.path.join(pkg_dir, 'package.json'), encoding='utf-8')).get('license')
        text = ''
        if os.path.isdir(pkg_dir):
            for f in sorted(os.listdir(pkg_dir)):
                if re.match(r'(licen[cs]e|copying|notice)', f, re.I) and os.path.isfile(os.path.join(pkg_dir, f)):
                    text += open(os.path.join(pkg_dir, f), encoding='utf-8', errors='replace').read().strip() + '\n\n'
        rows.append((name, info.get('version', ''), str(lic or 'see package')))
        texts.setdefault(text.strip() or f'{lic} (no licence file in the package)', []).append(f"{name}@{info.get('version', '')}")
    body = ['<!-- title: Open-source licences · تراخيص البرمجيات مفتوحة المصدر -->', '<section lang="en">', '<h1>Open-source licences</h1>',
            f'<p class="meta">Hisab is built with {len(rows)} open-source packages. We thank their authors. Each package is listed with its licence, followed by the licence texts.</p>',
            '<p lang="ar" dir="rtl">بُني حساب باستخدام برمجيات مفتوحة المصدر، ونشكر مؤلفيها. القائمة أدناه تذكر كل حزمة وترخيصها ثم نصوص التراخيص.</p>',
            '<table><thead><tr><th>Package</th><th>Version</th><th>Licence</th></tr></thead><tbody>']
    body += [f'<tr><td>{html.escape(n)}</td><td>{html.escape(v)}</td><td>{html.escape(l)}</td></tr>' for n, v, l in rows]
    body += ['</tbody></table>', '<h2>Licence texts</h2>']
    for text, users in texts.items():
        body.append(f'<h3>{html.escape(", ".join(users))}</h3><pre>{html.escape(text)}</pre>')
    return '\n'.join(body + ['</section>'])

site = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
os.makedirs(os.path.join(out, 'hisab'))
shutil.copy(os.path.join(site, 'site.css'), os.path.join(out, 'hisab', 'site.css'))
pages = {name: open(os.path.join(site, name + '.html'), encoding='utf-8').read() for name in ('index', 'terms', 'privacy', 'delete-data', 'support')}
pages['licenses'] = licenses_page(os.path.join(os.path.dirname(site)))
for name, body in pages.items():
    title = re.match(r'<!-- title: (.*?) -->', body).group(1)
    body = re.sub(r'\{\{(\w+)\}\}', lambda m: values[m.group(1)], body)
    dest = os.path.join(out, 'hisab') if name == 'index' else os.path.join(out, 'hisab', name)
    os.makedirs(dest, exist_ok=True)
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title><link rel="stylesheet" href="{SITE_PATH}/site.css"></head><body>
<header><div class="wrap"><a href="{SITE_PATH}/">Hisab · حساب</a><nav><a href="{SITE_PATH}/terms/">Terms</a><a href="{SITE_PATH}/privacy/">Privacy</a><a href="{SITE_PATH}/delete-data/">Delete data</a><a href="{SITE_PATH}/support/">Support</a></nav></div></header>
<main class="wrap">{body}</main><footer>© 2026 FutureX Technical Solutions · فيوتشر اكس للحلول التقنية</footer></body></html>"""
    open(os.path.join(dest, 'index.html'), 'w', encoding='utf-8').write(page)
for name in ('terms', 'privacy', 'support'):
    assert '{{' not in open(os.path.join(out, 'hisab', name, 'index.html'), encoding='utf-8').read(), name
print(sorted(os.listdir(out)))
