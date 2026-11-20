import type { Metadata } from "next";

import ExamListClient from "./ExamListClient";

export const metadata: Metadata = {
  title: "试卷",
  description: "自动组卷与手工组卷，限时作答后自动判分。",
};

export default function ExamPage() {
  return <ExamListClient />;
}
