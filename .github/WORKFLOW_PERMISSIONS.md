# Workflow Token Permissions

This repository uses least-privilege permissions for CI/release automation.

- Read-only checks (`beta-release-checks`, approval checks, merge-queue checks):
  - `contents: read`
  - `pull-requests: read`
- Post-merge channel pointer updates:
  - `contents: write`

No workflow should request broader permissions unless explicitly required by a change.
