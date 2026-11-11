import { Baseline1794020175742 } from './1794020175742-Baseline.js';
import { AddDateUnknownExternalIdRunMetrics1794020219836 } from './1794020219836-AddDateUnknownExternalIdRunMetrics.js';
import { TimestampsToTimestamptz1794100000000 } from './1794100000000-TimestampsToTimestamptz.js';
import { AddEventImageStore1794200000000 } from './1794200000000-AddEventImageStore.js';
import { EncryptTelegramToken1794300000000 } from './1794300000000-EncryptTelegramToken.js';
import { CreateAuditLogs1794300000001 } from './1794300000001-CreateAuditLogs.js';
import { CreateRefreshTokens1794400000000 } from './1794400000000-CreateRefreshTokens.js';
import { CreateNotificationOutbox1794500000000 } from './1794500000000-CreateNotificationOutbox.js';
import { CreateSitemapSeenUrls1794600000000 } from './1794600000000-CreateSitemapSeenUrls.js';
import { AddMustChangePassword1794700000000 } from './1794700000000-AddMustChangePassword.js';
import { AddUserFullName1794800000000 } from './1794800000000-AddUserFullName.js';

/** Danh sách migration theo thứ tự. Thêm migration mới vào cuối mảng. */
export const migrations = [
  Baseline1794020175742,
  AddDateUnknownExternalIdRunMetrics1794020219836,
  TimestampsToTimestamptz1794100000000,
  AddEventImageStore1794200000000,
  EncryptTelegramToken1794300000000,
  CreateAuditLogs1794300000001,
  CreateRefreshTokens1794400000000,
  CreateNotificationOutbox1794500000000,
  CreateSitemapSeenUrls1794600000000,
  AddMustChangePassword1794700000000,
  AddUserFullName1794800000000,
];
