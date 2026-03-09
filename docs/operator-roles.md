# Operator Role Responsibilities

## Author
- Creates and updates skill implementation.
- Opens `beta-release` pull request with required release evidence.
- Responds to review feedback until checks pass.

## Skill Owner
- Owns long-term quality and release decisions for assigned skills.
- Must initiate `promote-stable` pull request.
- Provides final risk note and promotion rationale.

## Supervisor
- Approves `beta-release` pull requests before merge.
- Approves `promote-stable` pull requests before merge.
- Can request changes to block promotion if evidence is insufficient.

## Security Reviewer
- Reviews high-risk changes (permissions, execution scope, provenance concerns).
- Adds security approval or blocking comments based on risk findings.

## Standard Operating Flow
1. Author opens `beta-release` PR.
2. CI checks and supervisor approval must pass.
3. After beta validation period and feedback review, skill owner opens `promote-stable` PR.
4. Supervisor approval and checks pass.
5. Stable pointer update runs post-merge; audit records are updated.
