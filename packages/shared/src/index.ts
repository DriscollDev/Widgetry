// Public surface of @widgetry/shared.
//
// Contracts here are imported by BOTH apps/web and apps/api so a request shape
// can never drift between the two (Eng §6.3). Still to come:
//   src/api/       boards, widgets, snapshots, credentials contracts
//   src/widgets/   per-widget-type config schemas + WidgetTypeDef registry (§7.1)

export * from './api/auth.js';
export * from './api/errors.js';
export * from './api/health.js';
