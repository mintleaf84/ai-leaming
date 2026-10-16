const fs = require("fs");
const path = require("path");

const REPORT_PATH = "eslint_report.json";

function fixFile(filePath, messages) {
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, "utf-8");
  let lines = content.split(/\r?\n/);
  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";

  // Sort messages by line (descending) and column (descending)
  messages.sort((a, b) => {
    if (a.line !== b.line) return b.line - a.line;
    return b.column - a.column;
  });

  let modified = false;
  for (const msg of messages) {
    const ruleId = msg.ruleId;
    const lineIdx = msg.line - 1;
    const colIdx = msg.column - 1;

    if (lineIdx < 0 || lineIdx >= lines.length) continue;

    let line = lines[lineIdx];

    if (ruleId === "@typescript-eslint/no-unused-vars") {
      const match = msg.message.match(/'([^']+)'/);
      if (match) {
        const varName = match[1];
        if (varName.startsWith("_")) continue;

        if (
          colIdx < line.length &&
          line.substring(colIdx, colIdx + varName.length) === varName
        ) {
          lines[lineIdx] =
            line.substring(0, colIdx) + "_" + line.substring(colIdx);
          modified = true;
          console.log(
            `Fixed ${ruleId} in ${filePath}:${msg.line} (prefixed ${varName})`,
          );
        }
      }
    } else if (ruleId === "react/no-unescaped-entities") {
      // Very simple replacement for common entities
      const newLine = line.replace(/"/g, "&quot;").replace(/'/g, "&apos;");
      if (newLine !== line) {
        lines[lineIdx] = newLine;
        modified = true;
        console.log(`Fixed ${ruleId} in ${filePath}:${msg.line}`);
      }
    } else if (ruleId === "@typescript-eslint/no-explicit-any") {
      if (
        colIdx < line.length &&
        line.substring(colIdx, colIdx + 3) === "any"
      ) {
        lines[lineIdx] =
          line.substring(0, colIdx) + "unknown" + line.substring(colIdx + 3);
        modified = true;
        console.log(
          `Fixed ${ruleId} in ${filePath}:${msg.line} (any -> unknown)`,
        );
      }
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, lines.join(lineEnding), "utf-8");
  }
}

function main() {
  const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf-8"));
  for (const fileEntry of report) {
    const filePath = fileEntry.filePath;
    const messages = fileEntry.messages;
    if (messages && messages.length > 0) {
      fixFile(filePath, messages);
    }
  }
}

main();
