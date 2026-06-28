import re

def consolidate_media_queries():
    with open('style.css', 'r', encoding='utf-8') as f:
        css = f.read()

    # Regex to find @media (max-width: 640px) { ... }
    # This assumes properly balanced braces for the first level inside the media block
    # A more robust parser is needed if media queries contain nested blocks (which css does).
    # Since writing a full CSS parser in regex is hard, we will do a basic curly brace matching.
    
    merged_rules = []
    
    def extract_block(match):
        start_idx = match.end()
        brace_count = 1
        idx = start_idx
        while idx < len(css) and brace_count > 0:
            if css[idx] == '{':
                brace_count += 1
            elif css[idx] == '}':
                brace_count -= 1
            idx += 1
        
        # Extract the content inside the media query
        content = css[start_idx:idx-1].strip()
        merged_rules.append(content)
        
        # Return empty string to remove it from original location
        return ""

    # This regex matches the exact opening of the media query
    pattern = re.compile(r'@media\s*\(\s*max-width\s*:\s*640px\s*\)\s*\{')
    
    new_css = css
    matches = list(pattern.finditer(new_css))
    
    # Process from end to start to not mess up indices
    for match in reversed(matches):
        start_idx = match.start()
        inner_start = match.end()
        
        brace_count = 1
        idx = inner_start
        while idx < len(new_css) and brace_count > 0:
            if new_css[idx] == '{':
                brace_count += 1
            elif new_css[idx] == '}':
                brace_count -= 1
            idx += 1
            
        content = new_css[inner_start:idx-1].strip()
        merged_rules.append(content)
        
        # Remove this block from css
        new_css = new_css[:start_idx] + new_css[idx:]

    # Consolidate all rules into one block
    # Reverse merged_rules to keep original cascade order (since we processed backwards)
    merged_rules.reverse()
    
    consolidated_block = "\n/* ==========================================\n   CONSOLIDATED MOBILE STYLES (max-width: 640px)\n   ========================================== */\n@media (max-width: 640px) {\n"
    for rule in merged_rules:
        consolidated_block += "    " + rule.replace("\n", "\n    ") + "\n\n"
    consolidated_block += "}\n"

    # Append to the end of the file
    final_css = new_css.strip() + "\n\n" + consolidated_block

    with open('style.css', 'w', encoding='utf-8') as f:
        f.write(final_css)
        
    print(f"Successfully consolidated {len(merged_rules)} media queries into 1.")
    print(f"Original file length: {len(css)}")
    print(f"New file length: {len(final_css)}")

if __name__ == "__main__":
    consolidate_media_queries()
