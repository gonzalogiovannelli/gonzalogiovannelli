// The repo version, bumped automatically on every commit from its prefix.
//
//   feat: something new (skill, script, area)      → bumps MINOR   1.4.2 → 1.5.0
//   fix:  adjustment to something that exists     → bumps PATCH   1.4.2 → 1.4.3
//   chore: pure data                              → no bump
//   feat!: or fix!: changes how the repo is used  → bumps MAJOR   1.4.2 → 2.0.0
//
// Called by two hooks: `commit-msg` rejects a message without a prefix, and `post-commit`
// bumps VERSION, adds the CHANGELOG entry, folds both into the same commit with --amend
// and tags it. See the Versioning section of README.md.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PREFIJO = /^(feat|fix|chore)(\([^)]+\))?(!)?: \S/;
const LIBRES = /^(Merge|Revert|fixup!|squash!)/;

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const raiz = git('rev-parse', '--show-toplevel');
const gitDir = git('rev-parse', '--absolute-git-dir');

function commitMsg(fichero) {
  const linea = fs.readFileSync(fichero, 'utf8').split('\n')[0];
  if (PREFIJO.test(linea) || LIBRES.test(linea)) return;
  console.error(`Commit stopped: the message has no type prefix.

  feat: something new       (bumps 1.4.2 → 1.5.0)
  fix:  adjustment          (bumps 1.4.2 → 1.4.3)
  chore: data               (no bump)
  feat!: or fix!: breaking  (bumps 1.4.2 → 2.0.0)

Message received: "${linea}"`);
  process.exit(1);
}

function subir(version, tipo, rompe) {
  const [M, m, p] = version.split('.').map(Number);
  if (rompe) return `${M + 1}.0.0`;
  if (tipo === 'feat') return `${M}.${m + 1}.0`;
  return `${M}.${m}.${p + 1}`;
}

function postCommit() {
  if (process.env.VERSIONANDO) return;
  // During a rebase or cherry-pick the --amend would rewrite commits other than the one being made.
  if (['rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD'].some(f => fs.existsSync(path.join(gitDir, f)))) return;

  const asunto = git('log', '-1', '--format=%s');
  const t = asunto.match(PREFIJO);
  if (!t || t[1] === 'chore') return;

  const fVersion = path.join(raiz, 'VERSION');
  const fLog = path.join(raiz, 'CHANGELOG.md');
  const anterior = fs.existsSync(fVersion) ? fs.readFileSync(fVersion, 'utf8').trim() : '1.0.0';
  const nueva = subir(anterior, t[1], Boolean(t[3]));
  const fecha = git('log', '-1', '--format=%ad', '--date=short');

  fs.writeFileSync(fVersion, nueva + '\n');
  const log = fs.readFileSync(fLog, 'utf8');
  const corte = log.indexOf('\n## ');
  const entrada = `\n## ${nueva} (${fecha})\n\n${asunto}\n`;
  fs.writeFileSync(fLog, corte === -1 ? log + entrada : log.slice(0, corte) + entrada + log.slice(corte));

  git('add', fVersion, fLog);
  execFileSync('git', ['commit', '--amend', '--no-edit', '--no-verify'], {
    env: { ...process.env, VERSIONANDO: '1' },
    stdio: 'ignore',
  });
  git('tag', `v${nueva}`);
  console.log(`Version ${anterior} → ${nueva}`);
}

const [modo, arg] = process.argv.slice(2);
if (modo === 'commit-msg') commitMsg(arg);
else if (modo === 'post-commit') postCommit();
else { console.error('Usage: version.js commit-msg <file> | post-commit'); process.exit(2); }
