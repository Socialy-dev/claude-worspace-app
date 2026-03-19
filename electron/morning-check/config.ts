import fs from 'fs'
import path from 'path'
import os from 'os'

export interface MorningCheckProject {
  name: string
  path: string
  message?: string
}

export interface MorningCheckSchedule {
  hour: number
  minute: number
}

export interface MorningCheckConfig {
  enabled: boolean
  schedule: MorningCheckSchedule
  wakeFromSleep: boolean
  defaultMessage: string
  projects: MorningCheckProject[]
}

const CONFIG_DIR = path.join(os.homedir(), '.cw')
const CONFIG_PATH = path.join(CONFIG_DIR, 'morning-check.json')

const DEFAULT_CONFIG: MorningCheckConfig = {
  enabled: false,
  schedule: { hour: 6, minute: 0 },
  wakeFromSleep: true,
  defaultMessage: [
    'Fais un health check complet de ce projet :',
    '1. Vérifie s\'il y a des vulnérabilités de sécurité (OWASP Top 10, secrets exposés, failles d\'auth)',
    '2. Analyse les derniers commits pour détecter des problèmes',
    '3. Vérifie les dépendances (npm audit ou équivalent)',
    '4. Cherche des erreurs de types ou de compilation',
    '5. Identifie tout problème qui pourrait affecter les utilisateurs en production',
    '6. Donne un rapport détaillé avec niveau de sévérité (critique/haute/moyenne/basse)',
    '',
    'Sois exhaustif et concret.',
  ].join('\n'),
  projects: [],
}

function validateConfig(raw: unknown): MorningCheckConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  if (typeof obj.enabled !== 'boolean') return null
  if (!obj.schedule || typeof obj.schedule !== 'object') return null

  const sched = obj.schedule as Record<string, unknown>
  if (typeof sched.hour !== 'number' || typeof sched.minute !== 'number') return null
  if (sched.hour < 0 || sched.hour > 23 || sched.minute < 0 || sched.minute > 59) return null

  if (typeof obj.wakeFromSleep !== 'boolean') return null
  if (typeof obj.defaultMessage !== 'string' || obj.defaultMessage.trim().length === 0) return null
  if (!Array.isArray(obj.projects)) return null

  const validProjects: MorningCheckProject[] = []
  for (const p of obj.projects) {
    if (!p || typeof p !== 'object') continue
    const proj = p as Record<string, unknown>
    if (typeof proj.name !== 'string' || typeof proj.path !== 'string') continue
    if (proj.message !== undefined && typeof proj.message !== 'string') continue

    // Verify project path exists on disk
    if (!fs.existsSync(proj.path as string)) continue

    validProjects.push({
      name: proj.name as string,
      path: proj.path as string,
      message: proj.message as string | undefined,
    })
  }

  return {
    enabled: obj.enabled as boolean,
    schedule: { hour: sched.hour as number, minute: sched.minute as number },
    wakeFromSleep: obj.wakeFromSleep as boolean,
    defaultMessage: obj.defaultMessage as string,
    projects: validProjects,
  }
}

export function loadConfig(): MorningCheckConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      const validated = validateConfig(raw)
      if (validated) return validated
    }
  } catch {
    // Corrupted or missing file — return defaults
  }
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(config: MorningCheckConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}
