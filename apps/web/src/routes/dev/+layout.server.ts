// Gate for the whole `/dev` subtree (SCP-011).
//
// Everything under `/dev` is developer tooling: fixture-driven component
// galleries and a route harness. No FR/US/EX covers any of it, nothing in the
// product links to it, and it is not a product screen.
//
// A layout load runs for every route below it, so this one guard covers the
// index, the galleries, and anything added later - which is the point. Before
// this existed only `/dev` itself 404'd outside `vite dev`; the galleries
// shipped in production builds and were reachable unauthenticated, because
// `/dev` is a PUBLIC_PREFIX in hooks.server.ts. Two of those galleries mount
// modals wired to real write paths (`POST /v1/boards/:id/widgets`,
// `PATCH /v1/widgets/:id`), so they were a live, untested surface on the public
// origin. Ownership checks on the api made them a 401 rather than a breach, but
// it was surface the product did not need.
//
// 404 rather than 403 or a redirect, matching Eng §11.7: outside development
// these routes should read as though they do not exist.
//
// This gate is what keeps the merged-but-unfinished custom-widget composition
// UI safe to carry in the tree - it lives under `/dev` and stays unreachable
// until it is deliberately wired into the product.

import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
  if (!dev) error(404, 'Not found');

  return {};
};
