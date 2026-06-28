import os
import subprocess
import hashlib

IGNORE_DIRS = ['node_modules', '.git', '.vscode', '.agents', 'tools']
IGNORE_EXTS = ['.csv', '.json', '.log', '.bak', '.md', '.py']
IGNORE_FILES = ['.env', '.gitignore', 'package-lock.json', 'package.json', 'style.css', 'favicon.svg', 'robots.txt', 'sitemap.xml', 'manifest.json', 'check_sync.js']

def get_local_hashes(base_dir):
    hashes = {}
    for root, dirs, files in os.walk(base_dir):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for f in files:
            ext = os.path.splitext(f)[1]
            if ext in IGNORE_EXTS or f in IGNORE_FILES:
                continue
            
            full_path = os.path.join(root, f)
            rel_path = os.path.relpath(full_path, base_dir).replace('\\', '/')
            
            with open(full_path, 'rb') as fp:
                content = fp.read()
                
            digest = hashlib.md5(content).hexdigest()
                
            hashes['./' + rel_path] = digest
    return hashes

print("Generating local hashes...")
local_hashes = get_local_hashes(os.getcwd())

print("Fetching remote hashes via SSH...")
remote_cmd = ["ssh", "pi@192.168.1.100", "cd ~/offrly && find . -type f -not -path '*/node_modules/*' -not -path '*/.git/*' -not -name '.*' -not -name '*.csv' -not -name '*.json' -not -name '*.log' -not -name '*.bak' -not -name '*.md' -not -name '*.py' -not -name 'style.css' -not -name 'favicon.svg' -not -name 'manifest.json' -not -name 'robots.txt' -not -name 'sitemap.xml' -not -name 'check_sync.js' -exec md5sum {} +"]

try:
    result = subprocess.run(remote_cmd, capture_output=True, text=True, check=True)
except subprocess.CalledProcessError as e:
    print("SSH Error:", e.stderr)
    exit(1)

remote_hashes = {}
for line in result.stdout.split('\n'):
    line = line.strip()
    if not line:
        continue
    parts = line.split(maxsplit=1)
    if len(parts) == 2:
        hash_val, file_path = parts
        filename = os.path.basename(file_path)
        ext = os.path.splitext(file_path)[1]
        if ext in IGNORE_EXTS or filename in IGNORE_FILES:
            continue
        remote_hashes[file_path] = hash_val

only_local = []
only_remote = []
diff_hash = []

for f, h in local_hashes.items():
    if f not in remote_hashes:
        only_local.append(f)
    elif remote_hashes[f] != h:
        diff_hash.append(f)

for f in remote_hashes.keys():
    if f not in local_hashes:
        only_remote.append(f)

print("\n================ RAPPORT DE SYNCHRONISATION ================")
print(f"Fichiers Locaux  : {len(local_hashes)}")
print(f"Fichiers Serveur : {len(remote_hashes)}\n")

if only_local:
    print("UNIQUEMENT EN LOCAL (Manquants sur le serveur) :")
    for f in only_local: print(f"  - {f}")
    print()

if only_remote:
    print("UNIQUEMENT SUR LE SERVEUR (Obsolete ou crees la-bas) :")
    for f in only_remote: print(f"  - {f}")
    print()

if diff_hash:
    print("FICHIERS MODIFIES (Desynchronises) :")
    for f in diff_hash: print(f"  - {f}")
    print()

if not only_local and not only_remote and not diff_hash:
    print("PARFAITEMENT SYNCHRONISE ! (Aucune difference detectee)")
else:
    print("DES DIFFERENCES ONT ETE TROUVEES.")
print("============================================================\n")
