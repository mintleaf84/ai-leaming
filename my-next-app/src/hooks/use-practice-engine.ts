import { useEffect, useMemo, useReducer } from "react";
import {
  createPracticeReducer,
  INITIAL_STATE,
} from "./practice-engine/reducer";

export {
  createPracticeReducer,
  INITIAL_STATE,
} from "./practice-engine/reducer";

export function usePracticeEngine(enableIntelligentReview: boolean = false) {
  const reducer = useMemo(
    () => createPracticeReducer(enableIntelligentReview),
    [enableIntelligentReview],
  );
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  // Initialize (Mock)
  useEffect(() => {
    // In real app, fetch from API
    // dispatch({ type: 'INIT_SESSION', payload: [] });
  }, []);

  return { state, dispatch };
}
