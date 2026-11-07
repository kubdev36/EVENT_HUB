import { Baseline1794020175742 } from './1794020175742-Baseline.js';
import { AddDateUnknownExternalIdRunMetrics1794020219836 } from './1794020219836-AddDateUnknownExternalIdRunMetrics.js';
import { TimestampsToTimestamptz1794100000000 } from './1794100000000-TimestampsToTimestamptz.js';
import { AddEventImageStore1794200000000 } from './1794200000000-AddEventImageStore.js';
import { EncryptTelegramToken1794300000000 } from './1794300000000-EncryptTelegramToken.js';
import { CreateAuditLogs1794300000001 } from './1794300000001-CreateAuditLogs.js';

/** Danh sách migration theo thứ tự. Thêm migration mới vào cuối mảng. */
export const migrations = [
  Baseline1794020175742,
  AddDateUnknownExternalIdRunMetrics1794020219836,
  TimestampsToTimestamptz1794100000000,
  AddEventImageStore1794200000000,
  EncryptTelegramToken1794300000000,
  CreateAuditLogs1794300000001,
];
