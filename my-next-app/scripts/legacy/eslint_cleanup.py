import json
import os
import re

REPORT_PATH = 'eslint_report.json'

def fix_file(file_path, messages):
    if not os.path.exists(file_path):
        return
    
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Sort messages by line (descending) and column (descending)
    messages.sort(key=lambda x: (x.get('line', 0), x.get('column', 0)), reverse=True)
    
    modified = False
    for msg in messages:
        rule_id = msg.get('ruleId')
        line_idx = msg.get('line', 0) - 1
        col_idx = msg.get('column', 0) - 1
        
        if line_idx < 0 or line_idx >= len(lines):
            continue
            
        line = lines[line_idx]
        
        # 1. Fix no-unused-vars by prefixing with _
        if rule_id == '@typescript-eslint/no-unused-vars':
            # Find the variable name at the column
            # The message usually looks like "'name' is defined but never used"
            match = re.search(r"'([^']+)'", msg.get('message', ''))
            if match:
                var_name = match.group(1)
                # Check if it's already prefixed
                if var_name.startswith('_'):
                    continue
                
                # Replace var_name with _var_name at the specific column
                # We use regex to ensure we don't replace parts of other words
                # but since we have column info, we can be more precise.
                
                # Simple replacement in the line if it matches the column
                if col_idx < len(line) and line[col_idx:col_idx+len(var_name)] == var_name:
                    new_line = line[:col_idx] + '_' + line[col_idx:]
                    lines[line_idx] = new_line
                    modified = True
                    print(f"Fixed {rule_id} in {file_path}:{line_idx+1} (prefixed {var_name})")

        # 2. Fix react/no-unescaped-entities
        elif rule_id == 'react/no-unescaped-entities':
            # Replace common characters
            new_line = line.replace('"', '&quot;').replace("'", '&apos;').replace('>', '&gt;').replace('<', '&lt;')
            if new_line != line:
                lines[line_idx] = new_line
                modified = True
                print(f"Fixed {rule_id} in {file_path}:{line_idx+1}")

        # 3. Fix no-explicit-any by replacing with unknown (only in type contexts)
        elif rule_id == '@typescript-eslint/no-explicit-any':
            # If it's 'any' at col_idx, replace with 'unknown'
            if col_idx < len(line) and line[col_idx:col_idx+3] == 'any':
                # Check if it's likely a type (e.g. followed by , ) or )
                # For safety, just replace it.
                new_line = line[:col_idx] + 'unknown' + line[col_idx+3:]
                lines[line_idx] = new_line
                modified = True
                print(f"Fixed {rule_id} in {file_path}:{line_idx+1} (any -> unknown)")

    if modified:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(lines)

def main():
    with open(REPORT_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    for file_entry in data:
        file_path = file_entry.get('filePath')
        messages = file_entry.get('messages', [])
        if messages:
            fix_file(file_path, messages)

if __name__ == '__main__':
    main()
