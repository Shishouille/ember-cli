'use strict';

const assert = require('assert');
const fs = require('fs-extra');
const execa = require('execa');
const tmp = require('tmp');
const latestVersion = require('latest-version');
const { cloneBranch, clearRepo, generateOutputFiles } = require('./output-repo-helpers');
tmp.setGracefulCleanup();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const APP_REPO = 'ember-cli/ember-new-output';
const ADDON_REPO = 'ember-cli/ember-addon-output';
const [, , version] = process.argv;

assert(GITHUB_TOKEN, 'GITHUB_TOKEN must be set');
assert(version, 'a version must be provided as the first argument to this script.');

async function updateRepo(repoName, version) {
  let tag = `v${version}`;
  let latestEC = await latestVersion('ember-cli');
  let latestECBeta = await latestVersion('ember-cli', { version: 'beta' });

  let isLatest = version === latestEC;
  let isLatestBeta = version === latestECBeta;

  let command = repoName === 'ember-new-output' ? 'new' : 'addon';
  let name = repoName === 'ember-new-output' ? 'my-app' : 'my-addon';
  let isStable = !tag.includes('-beta');

  let outputRepoBranch = isStable ? 'stable' : 'master';
  let shouldUpdateMasterFromStable = tag.endsWith('-beta.1');
  let branchToClone = shouldUpdateMasterFromStable ? 'stable' : outputRepoBranch;
  let tmpdir = tmp.dirSync();

  let outputRepoPath = await cloneBranch(tmpdir.name, {
    repo: `https://github-actions:${GITHUB_TOKEN}@github.com/${repoName}.git`,
    branch: branchToClone,
  });

  await clearRepo(outputRepoPath);

  let generatedOutputPath = await generateOutputFiles({ tag, name, command, variant: 'javascript' });

  console.log('copying generated contents to output repo');
  await fs.copy(generatedOutputPath, outputRepoPath);

  if (shouldUpdateMasterFromStable) {
    await execa('git', ['checkout', '-B', 'master'], { cwd: outputRepoPath });
  }

  console.log('commiting updates');
  await execa('git', ['add', '--all'], { cwd: outputRepoPath });
  await execa('git', ['commit', '-m', tag], { cwd: outputRepoPath });
  await execa('git', ['tag', `-f`, `${tag}`], { cwd: outputRepoPath });

  console.log('pushing commit & tag');
  await execa('git', ['push', 'origin', `${tag}`, '--force'], { cwd: outputRepoPath });

  // Only push thihs branch if we are using an up-to-date tag
  if ((isStable && isLatest) || (!isStable && isLatestBeta)) {
    await execa('git', ['push', '--force', 'origin', outputRepoBranch], { cwd: outputRepoPath });
  }
}

async function main(version) {
  await updateRepo(APP_REPO, version);
  await updateRepo(ADDON_REPO, version);
}

main(version);
