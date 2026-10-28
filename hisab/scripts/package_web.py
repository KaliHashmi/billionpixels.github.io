"""Turn an Expo web export (built with baseUrl /__HB__) into a page that runs from any path."""
import base64, glob, os, re, shutil, sys

src, out, title, desc = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
shutil.rmtree(out, ignore_errors=True)
os.makedirs(out)
bundle = glob.glob(os.path.join(src, '_expo/static/js/web/entry-*.js'))[0]
js = open(bundle, encoding='utf-8').read()

# Embed the icon font so it never depends on font hosting rules.
font = glob.glob(os.path.join(src, 'assets/**/Ionicons.*.ttf'), recursive=True)[0]
font_rel = '/__HB__/' + os.path.relpath(font, src).replace(os.sep, '/')
assert f'"{font_rel}"' in js, 'font path not found'
js = js.replace(f'"{font_rel}"', '"data:font/ttf;base64,' + base64.b64encode(open(font, 'rb').read()).decode() + '"')

# Embed images too (small PNGs): keeps the bundle self-contained.
def embed(m):
    rel = m.group(1)
    path = os.path.join(src, rel)
    if not os.path.exists(path):
        return m.group(0)
    return '"data:image/png;base64,' + base64.b64encode(open(path, 'rb').read()).decode() + '"'
js = re.sub(r'"/__HB__/(assets/[^"]+\.png)"', embed, js)

# Remaining base references resolve at runtime from where the page is served.
js = js.replace('"/__HB__"', 'self.__HB__')
js = js.replace('"/__HB__/', 'self.__HB__+"/')
left = [m.start() for m in re.finditer('__HB__', js) if not js[max(0, m.start() - 5):m.start()].endswith('self.')]
print('unrewritten', len(left), [js[i - 40:i + 30] for i in left][:3])
os.makedirs(os.path.join(out, 'js'))
open(os.path.join(out, 'js/hisab.js'), 'w', encoding='utf-8').write(js)

page = f'''<title>{title}</title>
<meta name="description" content="{desc}">
<style>
  :root {{ --bg: #F4F5F7; color-scheme: light; }}
  html, body {{ height: 100%; }}
  body {{ overflow: hidden; background: var(--bg); }}
  #root {{ display: flex; height: 100%; flex: 1; }}
  #boot {{ margin: auto; font: 15px system-ui, sans-serif; color: #714B67; }}
</style>
<div id="root"><p id="boot">Loading Hisab…</p></div>
<script>
  (function () {{
    // Run from whatever path the page is served at: the app's router and files are relative to it.
    // On the public site the app lives under /hisab-uat/ or /hisab-app/, also when a deep link is reloaded.
    var m = location.pathname.match(/^(.*\\/hisab-(?:uat|app))(\\/|$)/);
    var base = m ? m[1] : location.pathname.replace(/[^/]*$/, '').replace(/\\/$/, '');
    self.__HB__ = base;
    var s = document.createElement('script');
    s.src = base + '/js/hisab.js';
    s.onerror = function () {{ document.getElementById('boot').textContent = 'Hisab could not load. Reload the page.'; }};
    document.body.appendChild(s);
  }})();
</script>
'''
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)
print('bundle MB', round(len(js) / 1e6, 2))
