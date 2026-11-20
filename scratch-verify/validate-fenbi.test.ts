import fs from "fs";
import { parseFenbiData } from "@/lib/import/fenbi-parser";

it("1680 book ch5 export parses", () => {
  const base =
    "/public/home/cjb/data/jiaozong_1680/output/fenbi/jz1680-p1c5-r1";
  const ex = fs.readFileSync(base + "_exercise.json", "utf-8");
  const so = fs.readFileSync(base + "_solutions.json", "utf-8");
  const r = parseFenbiData(ex, so);
  console.log(
    "questions",
    r.questions.length,
    "records",
    r.records.length,
    "correct",
    r.correctCount,
    "wrong",
    r.errorCount,
    "key",
    r.sourceKey,
    "name",
    r.sessionName,
  );
  const byType: Record<string, number> = {};
  for (const q of r.questions) byType[q.type] = (byType[q.type] || 0) + 1;
  console.log("types", byType);
  console.log("sample", JSON.stringify(r.questions[0]).slice(0, 400));
  console.log("tags", JSON.stringify(r.questions[0].tags));
  expect(r.questions.length).toBe(91);
  expect(r.records.length).toBe(91);
});
