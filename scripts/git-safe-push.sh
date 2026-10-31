#!/usr/bin/env bash
set -Eeuo pipefail
# Actions writers share main-write-queue. Retry races with writers outside Actions.
# Never force-push or silently discard another writer's changes.
remote="${GIT_PUSH_REMOTE:-origin}"
branch="${GIT_PUSH_BRANCH:-main}"
attempts="${GIT_PUSH_ATTEMPTS:-8}"
if ! [[ "$attempts" =~ ^[1-9][0-9]*$ ]]; then
  echo '::error::GIT_PUSH_ATTEMPTS must be a positive integer.' >&2
  exit 2
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo '::error::Commit or stash tracked changes before safe publishing.' >&2
  exit 2
fi
if [[ "$(git rev-parse --is-shallow-repository)" == "true" ]]; then
  git fetch --unshallow "$remote"
fi
ref="refs/remotes/${remote}/${branch}"
for ((attempt=1; attempt<=attempts; attempt++)); do
  echo "::group::Synchronize and safely publish ${branch} (${attempt}/${attempts})"
  git fetch --no-tags "$remote" "refs/heads/${branch}:${ref}"
  if ! git rebase "$ref"; then
    git rebase --abort || true
    echo '::error::Rebase conflict with newer main. Refusing to overwrite another writer; manual reconciliation required.' >&2
    git status --short || true
    exit 1
  fi
  if git merge-base --is-ancestor HEAD "$ref"; then
    echo 'This commit is already contained in remote main.'
    echo '::endgroup::'
    exit 0
  fi
  if git push "$remote" "HEAD:refs/heads/${branch}"; then
    git fetch --no-tags "$remote" "refs/heads/${branch}:${ref}"
    if git merge-base --is-ancestor HEAD "$ref"; then
      echo "Verified commit $(git rev-parse --short HEAD) in ${branch}."
      echo '::endgroup::'
      exit 0
    fi
    echo '::warning::Push returned success but remote ancestry could not be confirmed.' >&2
  else
    echo "::warning::A concurrent writer advanced ${branch}; retrying safely."
  fi
  echo '::endgroup::'
  if ((attempt<attempts)); then sleep $((attempt * 2)); fi
done
echo "::error::Unable to confirm publication after ${attempts} attempts; no force-push attempted." >&2
exit 1
