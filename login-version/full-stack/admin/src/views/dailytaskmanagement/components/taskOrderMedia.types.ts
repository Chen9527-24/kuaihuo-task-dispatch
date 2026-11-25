import type { DailyTaskOrderMediaDescriptor } from '@/api/modules/dailyTasks';

export interface TaskOrderPreviewSource {
  file?: DailyTaskOrderMediaDescriptor | null;
  legacyUrl?: string | null;
}
