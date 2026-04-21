import json
from collections import Counter
import re
import sys

def analyze_report(file_path):
    file_counts = Counter()
    try:
        with open(file_path, 'r', encoding='utf8', errors='ignore') as f:
            for line in f:
                match = re.match(r'^([^(\s]+)\(', line)
                if match:
                    fp = match.group(1).strip()
                    file_counts[fp] += 1
    except Exception as e:
        print(f"Error reading file: {e}", file=sys.stderr)
        return None
    
    categories = {
        "Tests (__tests__)": 0,
        "Components": 0,
        "API Routes": 0,
        "Server Actions": 0,
        "Services/Lib": 0,
        "Pages": 0,
        "Others": 0
    }
    
    sorted_files = []
    for path, count in file_counts.most_common():
        sorted_files.append({"file": path, "errors": count})
        if "__tests__" in path or "tests/" in path:
            categories["Tests (__tests__)"] += count
        elif "src/components/" in path:
            categories["Components"] += count
        elif "src/lib/api/routes/" in path:
            categories["API Routes"] += count
        elif "src/server/actions/" in path:
            categories["Server Actions"] += count
        elif "src/lib/" in path:
            categories["Services/Lib"] += count
        elif "src/app/" in path and "page.tsx" in path:
            categories["Pages"] += count
        else:
            categories["Others"] += count
            
    return {
        "summary": categories,
        "top_files": sorted_files[:20]
    }

if __name__ == "__main__":
    result = analyze_report('tsc_report_v4.txt')
    if result:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        sys.exit(1)
