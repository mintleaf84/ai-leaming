import React from 'react';
import PracticeClient from './PracticeClient';
import { getGlobalFeatureFlag } from '@/server/actions/feature-flags';

export default async function PracticePage() {
  // 服务端拉取全局功能开关，作为初始状态灌入客户端
  // KEY 应与后台调成一致
  const enableIntelligentReview = await getGlobalFeatureFlag('ENABLE_INTELLIGENT_REVIEW', false);

  return <PracticeClient initialEnableIntelligentReview={enableIntelligentReview} />;
}
