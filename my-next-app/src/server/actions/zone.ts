'use server';

import { requireUser } from '@/lib/auth/auth';
import { zoneService } from '@/lib/services/zone';

/**
 * 将标签移入观察区的 Server Action
 */
export async function moveToObservationZoneAction(tagName: string, reason: string) {
  const user = await requireUser();

  // 调用抽象后的 Service 层，处理异步 LibSQL 逻辑
  await zoneService.moveToObservationZone(user.id, tagName, reason);

  return { success: true };
}
