import { z } from 'zod';
import { QuestionSchema, CorrectionQuizSchema, RegressionChallengeSchema } from './schemas';

export type UserRole = 'admin' | 'student' | 'teacher';

export interface User {
  id: number;
  username: string;
  role: UserRole;
  token_version?: number;
}

export type Question = z.infer<typeof QuestionSchema> & { id: number };

export type ReviewStep = 'study' | 'quiz' | 'regression';

export interface ReviewItem {
  originalQuestionId: number;
  originalQuestionContent: string;
  wrongAnswer: string;
  tags: string[];

  // Generated Content
  studyContent?: string; // From RAG
  quiz?: z.infer<typeof CorrectionQuizSchema>;
  regression?: z.infer<typeof RegressionChallengeSchema>;

  // Progress
  currentStep: ReviewStep;
  regressionSubIndex: number; // For the 3-question regression challenge
  failedAttempts: number; // For melting logic (3 strikes)
}

export type PracticeMode = 'standard' | 'review_interruption';

export interface PracticeState {
  status: 'loading' | 'idle' | 'practicing' | 'reviewing' | 'finished' | 'error';
  sessionId: string | null;

  // Standard Practice
  sessionQueue: Question[];
  currentIndex: number;
  startTime: number; // For duration tracking
  answers: Record<number, { answer: string; isCorrect: boolean; duration: number }>;

  // Review Logic
  reviewQueue: ReviewItem[];
  currentReviewIndex: number;
  reviewTriggeredAt: number; // e.g., 25
}

export type Action =
  | { type: 'INIT_SESSION'; payload: { questions: Question[]; sessionId: string; startIndex?: number } }
  | { type: 'ANSWER_QUESTION'; payload: { questionId: number; answer: string; isCorrect: boolean; duration: number } }
  | { type: 'TRIGGER_REVIEW' }
  | { type: 'LOAD_REVIEW_DATA'; payload: { index: number; data: Partial<ReviewItem> } }
  | { type: 'COMPLETE_REVIEW_STEP'; payload: { success: boolean } }
  | { type: 'NEXT_REVIEW_ITEM' }
  | { type: 'RESUME_PRACTICE' }
  | { type: 'FINISH_SESSION' };
