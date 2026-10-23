<script setup lang="ts">
import { t } from '../../i18n'
import { computed, ref } from 'vue'
import type { CommitTemplate } from '../../../shared/types'
import { useAppStore } from '../../stores/app'
import { useRepoStore } from '../../stores/repo'
import PrefNumber from './PrefNumber.vue'

const app = useAppStore()
const repo = computed(() => (app.active ? useRepoStore(app.active) : null))
const templates = computed(() => app.settings?.commitTemplates ?? [])
const selectedId = ref<string | null>(templates.value[0]?.id ?? null)
const showGit = ref(false)
const selected = computed(() => (showGit.value ? null : (templates.value.find((x) => x.id === selectedId.value) ?? null)))
const isDefault = computed(() => !!app.active && !!selected.value && app.settings?.defaultTemplates[app.active] === selected.value.id)

function select(id: string) {
  selectedId.value = id
  showGit.value = false
}

function add() {
  const template: CommitTemplate = { id: crypto.randomUUID(), name: t('template.newName'), subject: '', body: '' }
  app.saveTemplates([...templates.value, template])
  select(template.id)
}

function edit(patch: Partial<CommitTemplate>) {
  const id = selected.value?.id
  if (id) app.saveTemplates(templates.value.map((x) => (x.id === id ? { ...x, ...patch } : x)))
}

function remove() {
  const template = selected.value
  if (!template || !window.confirm(t('template.confirmDelete', { name: template.name }))) return
  const rest = templates.value.filter((x) => x.id !== template.id)
  app.saveTemplates(rest)
  selectedId.value = rest[0]?.id ?? null
}

const value = (e: Event) => (e.target as HTMLInputElement | HTMLTextAreaElement).value
const checked = (e: Event) => (e.target as HTMLInputElement).checked
</script>

<template>
  <form class="settings-form" @submit.prevent>
    <h2>{{ t('settings.messageGuides') }}</h2>
    <label for="pref-subjectWarn">{{ t('setting.subjectWarn') }}</label>
    <div class="row"><PrefNumber id="pref-subjectWarn" field="subjectWarn" :min="20" :max="200" /> <span class="muted">{{ t('settings.charsYellow') }}</span></div>
    <label for="pref-subjectLimit">{{ t('setting.subjectLimit') }}</label>
    <div class="row"><PrefNumber id="pref-subjectLimit" field="subjectLimit" :min="20" :max="200" /> <span class="muted">{{ t('settings.charsRed') }}</span></div>
    <label for="pref-bodyGuide">{{ t('setting.bodyGuide') }}</label>
    <div class="row"><PrefNumber id="pref-bodyGuide" field="bodyGuide" :min="0" :max="200" /> <span class="muted">{{ t('settings.columnsNone') }}</span></div>
  </form>

  <h2 class="title">{{ t('settings.templates') }}</h2>
  <div class="templates">
    <ul>
      <li v-for="tpl in templates" :key="tpl.id" :class="{ active: !showGit && tpl.id === selectedId }" data-testid="template-entry" @click="select(tpl.id)">
        {{ tpl.name }}
      </li>
      <li v-if="repo?.gitTemplate" :class="{ active: showGit, git: true }" @click="showGit = true">commit.template (git)</li>
      <li class="add"><button type="button" data-testid="template-add" @click="add">{{ t('template.new') }}</button></li>
    </ul>

    <form v-if="selected" class="settings-form editor" @submit.prevent>
      <label for="template-name">{{ t('common.name') }}</label>
      <input id="template-name" data-testid="template-name" :value="selected.name" @input="edit({ name: value($event) })" />
      <label for="template-subject">{{ t('template.subject') }}</label>
      <input id="template-subject" data-testid="template-subject" :value="selected.subject" @input="edit({ subject: value($event) })" />
      <label for="template-body">{{ t('template.body') }}</label>
      <textarea id="template-body" data-testid="template-body" rows="8" :value="selected.body" @input="edit({ body: value($event) })" />
      <template v-if="app.active">
        <span />
        <label class="check">
          <input
            type="checkbox"
            data-testid="template-default"
            :checked="isDefault"
            @change="app.setDefaultTemplate(app.active, checked($event) ? selected.id : null)"
          />
          {{ t('template.defaultFor', { name: repo?.info?.name ?? '' }) }}
        </label>
      </template>
      <span />
      <div class="row"><button type="button" data-testid="template-delete" @click="remove">{{ t('template.delete') }}</button></div>
    </form>

    <div v-else-if="showGit && repo?.gitTemplate" class="git-template">
      <!-- Testi statici del dizionario, senza dati dell'utente -->
      <p class="muted" v-html="t('template.gitHint')" />
      <pre>{{ repo.gitTemplate.subject }}<template v-if="repo.gitTemplate.body">&#10;&#10;{{ repo.gitTemplate.body }}</template></pre>
    </div>
    <p v-else class="muted">{{ t('template.createHint') }}</p>
  </div>

  <aside class="help" v-html="t('template.help')" />
</template>

<style scoped>
.title { margin: 24px 0 8px; font-size: 13px; }
.templates { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; max-width: 900px; }
ul { margin: 0; padding: 4px; list-style: none; border: 1px solid var(--border); border-radius: 6px; align-self: start; }
li { padding: 5px 8px; border-radius: 4px; cursor: default; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
li:hover { background: var(--bg-hover); }
li.active { background: var(--selected-bg); font-weight: 600; }
li.git { font-style: italic; }
li.add:hover { background: transparent; }
li.add button { width: 100%; }
.editor input:not([type]) { width: 100%; }
textarea { width: 100%; font: 12px/1.4 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; color: inherit; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px; resize: vertical; }
.git-template pre { margin: 8px 0 0; padding: 8px; background: var(--bg-alt); border-radius: 5px; white-space: pre-wrap; }
.help { max-width: 900px; margin-top: 16px; padding: 10px 12px; font-size: 12px; line-height: 1.6; background: var(--bg-alt); border-radius: 6px; }
</style>
