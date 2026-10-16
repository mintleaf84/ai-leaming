import fs from "fs";
import path from "path";
import { db } from "../src/lib/db";
import { z } from "zod";

// Define Fenbi Source Schema (Partial)
interface FenbiQuestion {
  content: string;
  accessories: Array<{
    options: string[];
  }>;
  solution: string;
  keypoints: Array<{
    name: string;
  }>;
  correctAnswer: {
    choice: string; // "0", "1", "2", "3" or "0,1" for multi
  };
}

const SOURCE_PATH = path.join(
  "E:",
  "code",
  "ai-leaming",
  "题库",
  "粉笔示例数据.json",
);

// Helper to strip HTML tags
function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, "").trim();
}

async function importFenbiData() {
  console.log("🚀 Starting Import from Fenbi Data...");

  try {
    const rawData = fs.readFileSync(SOURCE_PATH, "utf-8");
    const sourceData = JSON.parse(rawData);

    // The JSON structure seems to wrap questions in a "solutions" array based on the file preview
    // Let's assume the root object has a "solutions" property.
    // If the file is just an array of questions, we'll use it directly.
    const questions: FenbiQuestion[] = Array.isArray(sourceData)
      ? sourceData
      : sourceData.solutions || [];

    console.log(`📊 Found ${questions.length} questions in source file.`);

    const insertStmt = db.prepare(`
      INSERT INTO questions (content, options, answer, explanation, tags, dimension, type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    const insertMany = db.transaction((qs: FenbiQuestion[]) => {
      let count = 0;
      let skipped = 0;

      for (const q of qs) {
        const content = stripHtml(q.content);
        const options = q.accessories?.[0]?.options || [];
        if (options.length === 0) {
          skipped++;
          continue;
        }

        const choiceRaw = q.correctAnswer?.choice || "";
        let answerStr = "";
        let type = "single";

        // Logic for Multi-choice
        if (choiceRaw.includes(",")) {
          type = "multi";
          const indices = choiceRaw.split(",").map((s) => parseInt(s.trim()));
          // Map indices to option text
          const answerArray = indices.map((i) => options[i]).filter(Boolean);
          answerStr = JSON.stringify(answerArray); // Store as JSON ["A", "C"]
        } else {
          type = "single";
          const choiceIndex = parseInt(choiceRaw);
          if (
            !isNaN(choiceIndex) &&
            choiceIndex >= 0 &&
            choiceIndex < options.length
          ) {
            answerStr = options[choiceIndex];
          } else {
            skipped++;
            continue;
          }
        }

        const explanation = stripHtml(q.solution);
        const tags = q.keypoints?.map((k) => k.name) || [];
        tags.push("真题导入");
        const dimension = "knowledge";

        try {
          insertStmt.run(
            content,
            JSON.stringify(options),
            answerStr, // Now stores plain text OR JSON string
            explanation,
            JSON.stringify(tags),
            dimension,
            type,
          );
          count++;
        } catch (e) {
          console.warn(
            `Failed to insert question: ${content.substring(0, 20)}...`,
            e,
          );
          skipped++;
        }
      }
      return { count, skipped };
    });

    const result = insertMany(questions);
    console.log(`✅ Import Completed!`);
    console.log(`   Success: ${result.count}`);
    console.log(
      `   Skipped: ${result.skipped} (Multi-choice or invalid format)`,
    );
  } catch (error) {
    console.error("❌ Import Failed:", error);
  }
}

importFenbiData();
