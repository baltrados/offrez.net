import os
import re

def clean_css():
    css_file = 'style.css'
    html_files = ['index.html', 'config.html', 'profils.html', 'analyse.html']
    js_files = ['js/legal.js', 'js/config-ui.js', 'js/sw-register.js', 'js/config.js', 'js/profils.js', 'js/analyse.js']

    with open(css_file, 'r', encoding='utf-8') as f:
        css = f.read()
    
    html_content = ""
    for file in html_files + js_files:
        if os.path.exists(file):
            with open(file, 'r', encoding='utf-8') as f:
                html_content += f.read()

    # Find all class selectors
    # Simple regex for .class-name
    classes = set(re.findall(r'\.([a-zA-Z_][a-zA-Z0-9_-]*)[\s\{:]', css))
    
    unused = []
    for c in classes:
        # Check if class exists in HTML/JS (simplistic word boundary check)
        if not re.search(r'\b' + re.escape(c) + r'\b', html_content):
            unused.append(c)
            
    print(f"Found {len(unused)} unused classes out of {len(classes)}.")
    print("Top 20:", unused[:20])

if __name__ == "__main__":
    clean_css()
