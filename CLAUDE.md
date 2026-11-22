
# OFFREZ — Claude Code Instructions

## Project Overview

OFFREZ is an intelligent personalized gift recommendation application.

Users configure a recipient and their preferences, then receive gift suggestions according to their profile and budget.

## Architecture Rules

- Preserve the existing architecture.
- Do not migrate to React, Vue, Next.js or another framework without approval.
- Inspect the repository before editing.
- Reuse existing functions and modules.
- Avoid unnecessary dependencies.
- Avoid duplicating existing logic.
- Prefer small and maintainable changes.

## Development Workflow

For non-trivial tasks:

1. Explore the existing code.
2. Use the architect agent to analyze the task.
3. Create an implementation plan.
4. Identify impacted files and risks.
5. Implement the changes using the appropriate agent.
6. Write or update tests.
7. Run tests and linting.
8. Use Playwright for frontend validation.
9. Request an independent code review.
10. Request a security audit when relevant.
11. Fix discovered issues.
12. Report the final state.

## Agent Delegation

Use agents when they provide meaningful independent work.

Available agents:
- architect
- frontend-developer
- backend-developer
- security-auditor
- test-engineer

Do not create unnecessary agents for trivial tasks.

Do not allow multiple agents to edit the same files simultaneously.

## Frontend

- Mobile-first and responsive.
- Accessible HTML.
- Semantic markup.
- Consistent UI.
- Avoid unnecessary animations.
- Optimize performance.
- Preserve the existing visual identity.

## Backend

- Validate input server-side.
- Handle external APIs safely.
- Handle errors and timeouts.
- Protect API keys.
- Never expose credentials in frontend files.
- Never trust external API responses.

## Security

- Check XSS and injection.
- Check secrets before commits.
- Do not weaken security protections.
- Never log API keys, tokens or private user data.
- Review new dependencies before adding them.

## Testing

- Add tests for new functionality.
- Run tests after modifications.
- Test edge cases.
- Test the browser when UI changes.
- Never claim tests passed without executing them.

## Git

- Work on a feature branch.
- Never commit directly to main.
- Review git diff before committing.
- Never push, merge or deploy without explicit approval.

## Final Report

Always report:

- Summary.
- Files modified.
- Tests executed.
- Test results.
- Audit findings.
- Remaining risks.
- Recommended next step.
