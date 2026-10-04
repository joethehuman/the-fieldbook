# Contributing

Fieldbook is source available under the [Elastic License 2.0](LICENSE). Contribute only material you have the right to license, and preserve the [third-party notices](docs/third-party-notices.md). For vulnerabilities, use [private security reporting](SECURITY.md); keep credentials and learner data out of issues, logs, and screenshots.

## Make a change

1. Describe the user problem and keep the change focused. Discuss major architecture or provider changes before implementing them.
2. Read [AGENTS.md](AGENTS.md) and the relevant code. For interface work, follow the [design system](docs/design-system.md). Check both the installed app and demo when changing shared code.
3. Use Node.js 22.x and pnpm 10.17.1. Install dependencies with pnpm install --frozen-lockfile. Run focused checks for the behavior you changed; use broader checks for substantial or release work. Review the diff and report what you verified and what remains untested.
4. Explain the resulting behavior, any migration or compatibility impact, and how you checked it in your contribution.

Run pnpm dev with a dedicated development backend configured as described in the [installation guide](docs/installation.md). Run pnpm dev:demo for the browser-local demo. Use synthetic fixtures for tests. Never commit .env.local, secrets, exports with personal data, or installation-specific content.

Authorization must be enforced on the server, including API and MCP paths. Add new database migrations instead of editing migrations that may already have run. Keep code and data changes separate: an application build does not apply SQL to an operator's database. Changes to a provider or release procedure need direct verification of that flow; a local build alone does not prove an installation works.

For UI changes, run pnpm check:ui and relevant browser checks such as pnpm test:ui. For other changes, select the applicable tests from package.json. Do not weaken checks to fit an implementation. Provide a clear reproduction when reporting a defect.
