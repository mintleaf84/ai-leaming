import { useEffect } from "react";

import { PracticeState } from "@/types";

export function useKeyboardShortcuts(
  state: PracticeState,
  submitAnswer: (answer: string) => void,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (state.status !== "practicing") return;
      const currentQ = state.sessionQueue[state.currentIndex];
      if (currentQ?.type === "multi" || currentQ?.type === "fill_blank") return;

      const key = e.key;
      const index = parseInt(key) - 1;
      if (index >= 0 && index < (currentQ?.options?.length || 0)) {
        submitAnswer(String.fromCharCode(65 + index));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.status, state.currentIndex, state.sessionQueue, submitAnswer]);
}
