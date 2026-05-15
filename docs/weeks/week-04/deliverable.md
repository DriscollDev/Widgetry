---
layout: week
title: Database Design (ERD)
week_number: 4
hide_week_nav: true
permalink: /weeks/week-04/deliverable.html
---

The entity-relationship model for Widgetry's persistent data. The interactive
diagram below is hosted by dbdiagram.io; a static export and the DBML source are
included as fallbacks.

<!--
  Replace EMBED_ID below with the ID from dbdiagram's "Share → Embed" option.
  The static fallback image lives in /assets/img/erd.svg - export from dbdiagram
  and commit it so this page works even if dbdiagram is unreachable.
-->

<iframe
  class="embed-frame"
  src="https://dbdiagram.io/e/69e929c4d80a958d1cb50770/69e92f981bbca0331218519e"
  title="Widgetry entity-relationship diagram"
  loading="lazy">
</iframe>

<details>
<summary>Image Backup</summary>
<figure class="figure">
  <img src="{{ '/assets/img/erd.svg' | relative_url }}" alt="Static export of the Widgetry ERD">
  <figcaption>Static fallback export, regenerated when the schema changes.</figcaption>
</figure>
</details>




<details>
  <summary>DBML source</summary>
  <pre><code>// =============================================================================
// Auth tables - owned by Better-Auth
// do NOT hand-write migrations for these - Better-Auth generates them.
// =============================================================================

Table users {
  id uuid [primary key, default: `gen_random_uuid()`]
  email text [unique, not null]
  email_verified_at timestamptz [note: 'Null = unverified; timestamp = when verified']
  name text
  image text
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table accounts {
  id uuid [primary key, default: `gen_random_uuid()`]
  user_id uuid [not null]
  provider_id text [not null, note: "'credentials' | 'google'"]
  account_id text [not null, note: "Provider's user id (Google sub for OAuth; user.id for credentials)"]
  password text [note: 'argon2id hash; only set when provider_id=credentials']
  access_token text
  refresh_token text
  id_token text
  access_token_expires_at timestamptz
  refresh_token_expires_at timestamptz
  scope text
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  indexes {
    (provider_id, account_id) [unique, name: 'idx_accounts_provider_lookup']
  }
}

Table sessions {
  id uuid [primary key, default: `gen_random_uuid()`]
  user_id uuid [not null]
  token text [unique, not null]
  expires_at timestamptz [not null, note: '30-day sliding window']
  ip_address text
  user_agent text
  created_at timestamptz [not null]
  updated_at timestamptz [not null]
}

Table verification_tokens {
  id uuid [primary key, default: `gen_random_uuid()`]
  identifier text [not null, note: 'Usually email; the thing being verified']
  value text [not null, note: 'Token (or hash thereof)']
  expires_at timestamptz [not null, note: 'Password reset: 1h; email verify: per Better-Auth default']
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  indexes {
    identifier [name: 'idx_verification_identifier']
  }
}


// =============================================================================
// Application tables - owned by us
// "All FKs are ON DELETE CASCADE unless noted."
// "timestamptz everywhere (never timestamp)."
// =============================================================================

Table boards {
  id uuid [primary key, default: `gen_random_uuid()`]
  user_id uuid [not null]
  name text [not null, note: '1-64 chars']
  refresh_mode text [not null, note: "CHECK IN ('auto', 'manual')"]
  refresh_interval_seconds integer [note: "CHECK IN (30,60,300,900,1800,3600) when auto, NULL when manual"]
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  indexes {
    (user_id, created_at) [name: 'idx_boards_user_recent', note: 'DESC on created_at; for board list query']
  }
}

Table widgets {
  id uuid [primary key, default: `gen_random_uuid()`]
  board_id uuid [not null]
  widget_type text [not null, note: "CHECK IN ('uptime','weather','stock','currency','datetime','clock','custom_json'); validated against code-only registry"]
  config jsonb [not null, note: 'Validated at write time against widget_type Zod schema']
  grid_col integer [not null, note: 'CHECK 0-11']
  grid_row integer [not null, note: 'CHECK >= 0']
  grid_width integer [not null, note: 'CHECK 1-6']
  grid_height integer [not null, note: 'CHECK 1-6 (FR-3.2)']
  refresh_interval_seconds integer [note: 'Server-polled widget types only; min 3600']
  retention_hours integer [not null, default: 168, note: 'CHECK 12-720; default 7 days']
  last_polled_at timestamptz [note: 'Updated by worker on poll; read by master scheduler']
  created_at timestamptz [not null]
  updated_at timestamptz [not null]

  indexes {
    board_id [name: 'idx_widgets_board']
    (last_polled_at, widget_type) [name: 'idx_widgets_scheduler', note: "Partial: WHERE widget_type IN (server-polled types); for scheduler sweep"]
  }
}

Table widget_snapshots {
  id bigserial [primary key]
  widget_id uuid [not null]
  captured_at timestamptz [not null]
  value jsonb [note: 'Typed payload per widget_type renderer']
  error jsonb [note: 'Null on success; structured error payload on failure']

  indexes {
    (widget_id, captured_at) [name: 'idx_snapshots_widget_time', note: 'DESC on captured_at; only access pattern']
  }
}

Table api_credentials {
  id uuid [primary key, default: `gen_random_uuid()`]
  widget_id uuid [unique, not null, note: 'One credential per widget']
  ciphertext bytea [not null]
  encrypted_dek bytea [not null]
  ciphertext_iv bytea [not null]
  dek_iv bytea [not null]
  ciphertext_auth_tag bytea [not null]
  dek_auth_tag bytea [not null]
  created_at timestamptz [not null]
}


// =============================================================================
// Relationships - all ON DELETE CASCADE
// =============================================================================

Ref: accounts.user_id > users.id [delete: cascade]
Ref: sessions.user_id > users.id [delete: cascade]
Ref: boards.user_id > users.id [delete: cascade]
Ref: widgets.board_id > boards.id [delete: cascade]
Ref: widget_snapshots.widget_id > widgets.id [delete: cascade]
Ref: api_credentials.widget_id - widgets.id [delete: cascade]

</code></pre>
</details>

## Notes

- Better-Auth owns `users`, `accounts`, `sessions`, and `verification_tokens`.
  Migrations for those tables are generated by the library, not hand-written.
- Application tables (`boards`, `widgets`, `widget_snapshots`, `api_credentials`)
  are owned by the team.
- All foreign keys cascade on delete. `timestamptz` is used everywhere; `timestamp`
  is never used.
