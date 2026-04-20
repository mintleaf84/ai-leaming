#!/usr/bin/env python3
import subprocess
import os
import sys

os.chdir(r'C:\Users\cjb\Documents\code\ai-leaming\my-next-app')

print("=" * 80)
print("1. Running: npm run lint")
print("=" * 80)
result_lint = subprocess.run(['npm', 'run', 'lint'], capture_output=True, text=True)
print(result_lint.stdout)
if result_lint.stderr:
    print("STDERR:", result_lint.stderr)
lint_returncode = result_lint.returncode
print(f"Return code: {lint_returncode}")

print("\n" + "=" * 80)
print("2. Running: npx tsc --noEmit")
print("=" * 80)
result_tsc = subprocess.run(['npx', 'tsc', '--noEmit'], capture_output=True, text=True)
print(result_tsc.stdout)
if result_tsc.stderr:
    print("STDERR:", result_tsc.stderr)
tsc_returncode = result_tsc.returncode
print(f"Return code: {tsc_returncode}")

sys.exit(max(lint_returncode, tsc_returncode))
