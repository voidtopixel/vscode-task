// Packages a custom (fork) build of the extension with a version that says so and changes on every build:
//
//   <major>.<minor>.<patch + 1>-custom.<YYYYMMDDHHmm>.g<short sha>[.dirty]     e.g. 1.0.2-custom.202610131230.gf2e1b14
//
// - "-custom" marks the build as ours in the Extensions view and in the "Task (Debug)" log.
// - The timestamp makes every build newer than the previous one, so VS Code sees an update on install.
// - "g<sha>" is the commit it was built from; ".dirty" means it also contains uncommitted changes.
// - The next patch number keeps it above the marketplace release it is based on (no "update" back to upstream)
//   while staying below the next upstream release.
//
// package.json is not modified. Usage: pnpm run package:custom
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const { name, version: base } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const [major, minor, patch] = base.split(/[.-]/).map(Number);
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const sha = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no') !== '' ? '.dirty' : '';
const version = `${major}.${minor}.${patch + 1}-custom.${stamp}.g${sha}${dirty}`;

console.log(`Packaging ${name} ${version}`);
execFileSync('pnpm', ['exec', 'vsce', 'package', version, '--no-git-tag-version', '--no-update-package-json',
    '--out', `${name}-${version}.vsix`], { stdio: 'inherit' });
