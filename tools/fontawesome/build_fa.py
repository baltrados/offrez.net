"""Build a reduced Font Awesome 6.5.0 Free stylesheet + subset woff2 fonts.

Usage: python -I build_fa.py <fa-orig dir> <public dir> <font version token>
Scans public/**/*.html and public/js/**/*.js for fa-* classes.
"""
import os, re, sys, glob, subprocess

SRC, PUB, VER = sys.argv[1], sys.argv[2], sys.argv[3]

# 1. Inventory
used = set()
for f in glob.glob(os.path.join(PUB, '**', '*.html'), recursive=True) + glob.glob(os.path.join(PUB, 'js', '**', '*.js'), recursive=True):
    with open(f, encoding='utf-8') as fh:
        used |= set(re.findall(r'\bfa-[a-z0-9-]+', fh.read()))
used.discard('fa-solid-900')
BASE = {'fa', 'fas', 'fab', 'fa-solid', 'fa-brands', 'fa-classic', 'fa-spin',
        'sr-only', 'sr-only-focusable', 'fa-sr-only', 'fa-sr-only-focusable'}
allowed = used | BASE

css = open(os.path.join(SRC, 'fontawesome', 'all.min.css'), encoding='utf-8').read()
header_end = css.index('*/') + 2
header, body = css[:header_end], css[header_end:]


def parse(s):
    """Split CSS into (prelude, block) top-level items. block is inner text."""
    out, i, n = [], 0, len(s)
    while i < n:
        j = s.find('{', i)
        if j < 0:
            break
        prelude = s[i:j].strip()
        depth, k, q = 1, j + 1, None
        while depth:
            c = s[k]
            if q:
                if c == '\\':
                    k += 1
                elif c == q:
                    q = None
            elif c in '"\'':
                q = c
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            k += 1
        out.append((prelude, s[j + 1:k - 1]))
        i = k
    return out


def split_selectors(prelude):
    parts, depth, cur = [], 0, ''
    for c in prelude:
        if c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
        if c == ',' and depth == 0:
            parts.append(cur); cur = ''
        else:
            cur += c
    parts.append(cur)
    return [p.strip() for p in parts]


codepoints = {'solid': set(), 'brands': set()}
section = 'solid'
kept_icons = set()


def filter_items(items):
    global section
    out = []
    for prelude, block in items:
        if prelude.startswith('@font-face'):
            fam = re.search(r'font-family:"([^"]+)"', block).group(1)
            mw = re.search(r'font-weight:(\d+)', block)
            weight = mw.group(1) if mw else ''
            if fam == 'Font Awesome 6 Brands':
                section = 'brands'
                out.append(f'@font-face{{font-family:"Font Awesome 6 Brands";font-style:normal;font-weight:400;font-display:block;src:url(../webfonts/fa-brands-400.woff2?v={VER}) format("woff2")}}')
            elif fam == 'Font Awesome 6 Free' and weight == '900':
                section = 'solid'
                out.append(f'@font-face{{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:900;font-display:block;src:url(../webfonts/fa-solid-900.woff2?v={VER}) format("woff2")}}')
            elif fam == 'Font Awesome 6 Free':
                section = 'regular'
            continue
        if prelude.startswith('@keyframes') or prelude.startswith('@-webkit-keyframes'):
            if prelude.split()[-1] == 'fa-spin':
                out.append(f'{prelude}{{{block}}}')
            continue
        if prelude.startswith('@'):
            inner = filter_items(parse(block))
            if inner:
                out.append(f'{prelude}{{{"".join(inner)}}}')
            continue
        sels = [s for s in split_selectors(prelude)
                if all(c in allowed for c in re.findall(r'\.([a-zA-Z0-9_-]+)', s))]
        if not sels:
            continue
        m = re.fullmatch(r'content:"\\([0-9a-f]+)"', block)
        if m:
            if section == 'regular':
                continue
            codepoints[section].add(int(m.group(1), 16))
            kept_icons.update(re.findall(r'\.(fa-[a-z0-9-]+):before', ','.join(sels)))
        out.append(f'{",".join(sels)}{{{block}}}')
    return out


result = header + '\n' + ''.join(filter_items(parse(body))) + '\n'

missing = sorted(u for u in used if u not in kept_icons and u not in BASE)
print('used classes:', len(used), sorted(used))
print('NOT FOUND in FA Free css (no glyph):', missing)
print('codepoints solid:', len(codepoints['solid']), 'brands:', len(codepoints['brands']))

out_css = os.path.join(PUB, 'css', 'fontawesome', 'fa-offrez.min.css')
with open(out_css, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(result)
print('css', os.path.getsize(out_css))

for name, key in (('fa-solid-900', 'solid'), ('fa-brands-400', 'brands')):
    uni = ','.join(f'U+{c:04X}' for c in sorted(codepoints[key]))
    dst = os.path.join(PUB, 'css', 'webfonts', name + '.woff2')
    subprocess.run([sys.executable, '-I', '-m', 'fontTools.subset', os.path.join(SRC, 'webfonts', name + '.ttf'),
                    f'--unicodes={uni}', '--flavor=woff2', f'--output-file={dst}',
                    '--layout-features=*', '--no-hinting', '--desubroutinize'], check=True)
    print(name, os.path.getsize(dst))
