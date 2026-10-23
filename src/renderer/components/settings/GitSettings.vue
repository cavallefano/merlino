<script setup lang="ts">
import { t } from '../../i18n'
import { onMounted, reactive, ref } from 'vue'
import type { GitConfigKey } from '../../../shared/types'
import { useAppStore } from '../../stores/app'

const app = useAppStore()
const gitPath = ref(app.git?.path ?? 'git')
const config = reactive<Record<string, string>>({})
const loaded = ref(false)

onMounted(async () => {
  const r = await window.api.gitGlobalConfig()
  if (r.ok) Object.assign(config, r.value)
  else app.error = r.error.message
  loaded.value = r.ok
})

// I campi di testo usano v-model su config: un salvataggio che finisce mentre scrivi in un altro campo non lo riscrive
async function save(key: GitConfigKey, value = config[key] ?? '') {
  const r = await window.api.setGitGlobalConfig(key, value)
  if (r.ok) config[key] = value.trim()
  else app.error = r.error.message
}

async function pickCloneFolder() {
  const path = await window.api.pickRepoFolder(app.preferences.cloneFolder ?? undefined)
  if (path) await app.updatePreferences({ cloneFolder: path })
}

const text = (e: Event) => (e.target as HTMLSelectElement).value
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <h2>{{ t('settings.executable') }}</h2>
    <label for="git-path">{{ t('settings.gitPath') }}</label>
    <div class="row">
      <input id="git-path" v-model="gitPath" data-testid="settings-git-path" placeholder="git" />
      <button type="button" data-testid="settings-git-path-apply" @click="app.setGitPath(gitPath.trim() || 'git')">{{ t('settings.use') }}</button>
    </div>
    <p class="hint" :class="{ error: app.git && !app.git.ok }">{{ app.git?.ok ? `git ${app.git.version}` : app.git?.error }}</p>

    <template v-if="loaded">
      <h2>{{ t('settings.identity') }}</h2>
      <p class="hint full">{{ t('settings.identityHint') }}</p>
      <label for="git-user-name">{{ t('common.name') }}</label>
      <input id="git-user-name" v-model="config['user.name']" data-testid="git-user.name" @change="save('user.name')" />
      <label for="git-user-email">Email</label>
      <input id="git-user-email" v-model="config['user.email']" data-testid="git-user.email" type="email" @change="save('user.email')" />

      <h2>{{ t('settings.signing') }}</h2>
      <span />
      <label class="check">
        <input
          type="checkbox"
          data-testid="git-commit.gpgsign"
          :checked="config['commit.gpgsign'] === 'true'"
          @change="save('commit.gpgsign', checked($event) ? 'true' : '')"
        />
        {{ t('settings.signAll') }}
      </label>
      <label for="git-gpg-format">{{ t('settings.format') }}</label>
      <select id="git-gpg-format" data-testid="git-gpg.format" :value="config['gpg.format'] ?? ''" @change="save('gpg.format', text($event))">
        <option value="">{{ t('settings.gpgDefault') }}</option>
        <option value="openpgp">GPG</option>
        <option value="ssh">SSH</option>
      </select>
      <label for="git-signingkey">{{ t('settings.key') }}</label>
      <input
        id="git-signingkey"
        v-model="config['user.signingkey']"
        data-testid="git-user.signingkey"
        :placeholder="t('settings.keyPlaceholder')"
        @change="save('user.signingkey')"
      />

      <h2>{{ t('settings.pullAndNew') }}</h2>
      <label for="git-pull-rebase">Pull</label>
      <select id="git-pull-rebase" data-testid="git-pull.rebase" :value="config['pull.rebase'] ?? ''" @change="save('pull.rebase', text($event))">
        <option value="">{{ t('settings.notSet') }}</option>
        <option value="false">Merge</option>
        <option value="true">Rebase</option>
      </select>
      <label for="git-default-branch">{{ t('settings.initialBranch') }}</label>
      <input
        id="git-default-branch"
        v-model="config['init.defaultBranch']"
        data-testid="git-init.defaultBranch"
        placeholder="master"
        @change="save('init.defaultBranch')"
      />
    </template>

    <h2>Clone</h2>
    <label>{{ t('settings.defaultFolder') }}</label>
    <div class="row">
      <span class="path" data-testid="pref-cloneFolder">{{ app.preferences.cloneFolder ?? t('settings.noFolder') }}</span>
      <button type="button" data-testid="pref-cloneFolder-pick" @click="pickCloneFolder">{{ t('common.choose') }}</button>
      <button v-if="app.preferences.cloneFolder" type="button" @click="app.updatePreferences({ cloneFolder: null })">{{ t('settings.clear') }}</button>
    </div>
  </form>
</template>

<style scoped>
.hint.full { grid-column: 1 / -1; margin: -2px 0 2px; }
.path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
input:not([type]), input[type='email'] { width: min(100%, 420px); }
</style>
