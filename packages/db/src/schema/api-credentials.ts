// packages/db/src/schema/api-credentials.ts
//
// Envelope-encrypted API key for a widget's upstream. Authority: Eng §5.2/§10.2.
// At most one credential per widget (widget_id UNIQUE). SIX bytea columns, no
// plaintext column anywhere:
//   ciphertext + ciphertext_iv + ciphertext_auth_tag : the API key, encrypted
//     under the per-record DEK (AES-GCM)
//   encrypted_dek + dek_iv + dek_auth_tag            : the DEK itself, encrypted
//     under the master key (AES-GCM)

import { pgTable, uuid } from 'drizzle-orm/pg-core';
import { tstz, bytea } from './column-types.js';
import { widgets } from './widgets.js';

export const apiCredentials = pgTable('api_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  widgetId: uuid('widget_id')
    .notNull()
    .unique()
    .references(() => widgets.id, { onDelete: 'cascade' }),
  ciphertext: bytea('ciphertext').notNull(),
  ciphertextIv: bytea('ciphertext_iv').notNull(),
  ciphertextAuthTag: bytea('ciphertext_auth_tag').notNull(),
  encryptedDek: bytea('encrypted_dek').notNull(),
  dekIv: bytea('dek_iv').notNull(),
  dekAuthTag: bytea('dek_auth_tag').notNull(),
  createdAt: tstz('created_at').notNull().defaultNow(),
});
