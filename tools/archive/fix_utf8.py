import os
import re

target_dir = r"c:\site cadeau\save"

files_to_repair = [
    'config.html',
    'profils.html',
    'analyse.html',
    'mentions-legales.html',
    'politique-confidentialite.html',
    'cgu.html',
    'blog.html',
    '404.html',
    'index.html',
    r'blog\cadeau-anniversaire-maman.html',
    r'blog\cadeau-couple-saint-valentin.html',
    r'blog\cadeau-noel-pas-cher.html',
    r'blog\cadeau-original-homme.html',
    r'blog\idees-cadeaux-femme.html'
]

print('--- DEBUT DE LA MISSION SAUVETAGE (Python) ---')

success_count = 0

for file in files_to_repair:
    file_path = os.path.join(target_dir, file)

    if os.path.exists(file_path):
        try:
            # Lire le fichier corrompu
            with open(file_path, 'r', encoding='utf-8') as f:
                corrupted_html = f.read()

            # Mimer exactement `Buffer.from(corrupted_html, 'latin1').toString('utf8')` de Node.js
            # Node prend juste `codepoint & 0xFF` pour chaque caractère
            repaired_bytes = bytes([ord(c) & 0xFF for c in corrupted_html])
            repaired_html = repaired_bytes.decode('utf-8', errors='replace')

            # REPARATION DU CLIC SUR INDEX.HTML
            if file == 'index.html':
                # Target exact: <h1><span class="brand-logo">OFFRE<span class="brand-z">Z</span></span></h1>
                broken_header = '<h1><span class="brand-logo">OFFRE<span class="brand-z">Z</span></span></h1>'
                fixed_header = '<a href="index.html" class="logo-link">\n                <h1><span class="brand-logo">OFFRE<span class="brand-z">Z</span></span></h1>\n            </a>'
                if broken_header in repaired_html:
                    repaired_html = repaired_html.replace(broken_header, fixed_header)
                    print('   -> Balise cliquable <a> réparée sur index.html !')

            # Réécriture sécurisée sur le disque
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(repaired_html)

            print(f'[SUCCES] Encodage restauré : {file}')
            success_count += 1

        except Exception as err:
            print(f'[ERREUR] Impossible de réparer {file} :', str(err))
    else:
        print(f'[INTROUVABLE] Le fichier {file} n\'existe pas.')

print('--- FIN ---')
print(f'Bilan : {success_count}/{len(files_to_repair)} fichiers sauvés et restaurés à la virgule près.')
