# Branch Protection - `main`

Source of truth: Engineering Doc §17.1 and §17.4.

> `main` is always deployable. Protected; requires 1 approval to merge
> (with 3 devs, 2 would block too much). Self-merge after approval is allowed.

This document records the GitHub settings that enforce the above on `main`,
the rationale for each setting, and how to apply them. The same rules can be
imported in one shot from `branch-ruleset.json` in this directory.

## Apply in one shot (recommended)

GitHub Repository Rulesets supports JSON import. Faster and version-controlled.

1. Push this directory to your repo so `branch-ruleset.json` is in `main`.
2. **Settings → Rules → Rulesets → New ruleset → Import a ruleset**.
3. Upload `.github/branch-ruleset.json`.
4. Set Enforcement status to **Active**.
5. Save.

To edit the rules later, edit `branch-ruleset.json`, delete the old ruleset
in the UI, and re-import. (GitHub does not currently support editing a
ruleset by re-importing JSON - it's a delete-and-recreate workflow.)

## Apply manually (if you prefer the UI)

**Settings → Branches → Add branch protection rule** (or **Settings → Rules → Rulesets**).

Branch name pattern: `main`

### Pull request rules

| Setting                                                       | Value | Why                                                                                          |
| ------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| Require a pull request before merging                         | ✅    | §17.1 - `main` is protected.                                                                  |
| Required approvals                                            | **1** | §17.1 - explicitly 1, not 2; rationale recorded there.                                       |
| Dismiss stale pull request approvals when new commits pushed  | ✅    | Forces a fresh look after rebases or post-review fixes.                                      |
| Require review from Code Owners                               | ❌ for now → ✅ after team meeting | CODEOWNERS uses placeholder usernames. Flip on once `Owner 1/2/3` is replaced with real GitHub handles. |
| Require approval of the most recent reviewable push           | ✅    | Closes the "approve, then push more, then merge" loophole.                                   |
| Require conversation resolution before merging                | ✅    | Stops dangling review comments from getting lost.                                            |

### Status check rules

| Setting                                                       | Value | Why                                                                                          |
| ------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| Require status checks to pass before merging                  | ✅    | Gates merges on `ci.yml` passing.                                                             |
| Require branches to be up to date before merging              | ✅    | Matches §17.1 rebase-every-48h culture; catches semantic conflicts.                          |
| Required checks                                               | `Static checks, unit tests, build` and `Integration tests` | Job names from `ci.yml`. If you rename jobs, update here. |

### History and push rules

| Setting                                                       | Value | Why                                                                                          |
| ------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| Require linear history                                        | ✅    | Matches the rebase-not-merge culture in §17.1; keeps `main` history readable.                |
| Allow force pushes                                            | ❌    | A force push to `main` would silently rewrite history under everyone's feet.                 |
| Allow deletions                                               | ❌    | Self-explanatory.                                                                            |
| Restrict who can push to matching branches                    | ❌    | All 3 devs need to be able to merge their own PRs (§17.4 "self-merge allowed").               |
| Require signed commits                                        | ❌    | Real security value, but every contributor needs a working GPG/SSH signing setup. Skip for capstone unless someone volunteers to onboard the team. |

### Bypass

| Setting                                                       | Value | Why                                                                                          |
| ------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| Bypass list                                                   | empty | Capstone scale; no need for emergency-bypass roles. If something goes truly wrong on `main`, an admin can temporarily disable the ruleset, push the fix, and re-enable. |

## Repository-level merge settings

These live under **Settings → General → Pull Requests**, not under branch
protection, but they belong with this config.

| Setting                                       | Value | Why                                                                                                     |
| --------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| Allow merge commits                           | ❌    | Linear history above means merge commits would be rejected anyway. Hiding the option avoids confusion.   |
| Allow squash merging                          | ✅    | Default merge method. Squash-merge title format: **Pull request title and description**.                |
| Allow rebase merging                          | ✅    | Useful when a PR's commits are individually meaningful (e.g., a careful refactor series).               |
| Always suggest updating pull request branches | ✅    | Nudges you to rebase before merging.                                                                    |
| Allow auto-merge                              | ✅    | Lets you queue a merge to fire as soon as CI passes - useful for the long integration-test job.        |
| Automatically delete head branches            | ✅    | Keeps the branch list clean post-merge.                                                                 |

## Branch naming (not enforced by GitHub, by convention only)

Per §17.1: `feat/<short-description>`, `fix/<short-description>`,
`chore/<short-description>`. GitHub branch protection has no first-class
naming rule; the team enforces this via PR review.

If you later want hard enforcement, a CI step using a regex check on
`github.head_ref` will fail PRs whose branch name doesn't match. Not added
to `ci.yml` because the convention is currently low-stakes for a 3-person team.

## What happens when

- **You open a PR to `main`** - required CI checks run. Merge button greyed
  out until both jobs pass and you have one approval.
- **A reviewer leaves "request changes"** - merge blocked until they
  re-review, or until another reviewer approves and the dismissal happens.
- **You push more commits after approval** - the approval is dismissed.
  Reviewer must re-approve. (This is the "dismiss stale" + "approve most
  recent push" combo doing its job.)
- **CI passes but the branch is behind `main`** - merge blocked until you
  rebase. The "update branch" button in the PR UI does this for you.
- **Someone wants to push directly to `main`** - rejected. There is no
  emergency bypass; if `main` is broken, the path forward is a hotfix PR.

## Adjustments expected over the project's lifetime

- **Sprint 1, after team-meeting names land:** flip `Require review from Code Owners` ON.
- **Sprint 4–5, if integration tests get long:** the auto-merge feature
  becomes more valuable; nothing to change in the config.
- **Sprint 5, before the demo:** consider tightening to 2 approvals
  temporarily during freeze week to slow risky merges. Revert after demo.
