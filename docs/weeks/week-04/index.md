---
title: "Week 4 — Database Design"
week_number: 4
summary: Entity-relationship diagram covering all persistent data — users, boards, widgets, snapshots, and encrypted credentials.
permalink: /weeks/week-04/
---

The ERD captures the application's persistent data. The interactive view is hosted
by dbdiagram.io and embedded directly; a static SVG export and the DBML source live
on the deliverable page as fallbacks in case the embed is unreachable.

Notes worth flagging:

- Better-Auth owns the auth-related tables (`users`, `accounts`, `sessions`,
  `verification_tokens`); we do not hand-write migrations for them.
- Application tables are designed against the requirements in the feature spec —
  in particular the credential-storage scheme uses envelope encryption with
  separate IV and auth-tag columns for the ciphertext and the encrypted DEK.
