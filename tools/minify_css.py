import re
import os

PARTIALS_DIR = 'css/partials'
PARTIALS_ORDER = [
    '_01-variables.css',
    '_02-base.css',
    '_03-header.css',
    '_04-buttons.css',
    '_05-forms.css',
    '_06-cards.css',
    '_07-gifts.css',
    '_08-hero.css',
    '_09-cro.css',
    '_10-legal.css',
    '_11-animations.css',
    '_12-responsive.css',
]

def minify_css():
    # Concaténer tous les partiels
    css = ''
    for filename in PARTIALS_ORDER:
        filepath = os.path.join(PARTIALS_DIR, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            css += f.read() + '\n'

    # Minification (inchangée)
    css = re.sub(r'/\*(?!!).*?\*/', '', css, flags=re.DOTALL)
    css = re.sub(r'\s*([\{\}\:\;\,\>])\s*', r'\1', css)
    css = re.sub(r';}', '}', css)
    css = re.sub(r'\s+', ' ', css)
    css = css.strip()

    with open('style.min.css', 'w', encoding='utf-8') as f:
        f.write(css)

    orig = sum(
        os.path.getsize(os.path.join(PARTIALS_DIR, f))
        for f in PARTIALS_ORDER
    )
    final = os.path.getsize('style.min.css')
    print(f"Source totale: {orig // 1024} KB ({len(PARTIALS_ORDER)} fichiers)")
    print(f"Minifié: {final // 1024} KB")

if __name__ == "__main__":
    minify_css()
