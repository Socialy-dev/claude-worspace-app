import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFileSync } from 'child_process'

const LABEL = 'com.claude-workspace.morning-check'
const PLIST_NAME = `${LABEL}.plist`
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents')
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, PLIST_NAME)

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildPlist(appPath: string, hour: number, minute: number): string {
  const logPath = escapeXml(path.join(os.homedir(), '.cw', 'morning-check.log'))
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/open</string>
        <string>-a</string>
        <string>${escapeXml(appPath)}</string>
        <string>--args</string>
        <string>--morning-check</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>${hour}</integer>
        <key>Minute</key>
        <integer>${minute}</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${logPath}</string>
</dict>
</plist>`
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function getUid(): string {
  try {
    return execFileSync('/usr/bin/id', ['-u'], { encoding: 'utf-8' }).trim()
  } catch {
    return ''
  }
}

function bootout(): void {
  const uid = getUid()
  if (!uid) return
  try {
    execFileSync('/bin/launchctl', ['bootout', `gui/${uid}/${LABEL}`], { encoding: 'utf-8' })
  } catch {
    // May not be loaded — that's fine
  }
}

export function installLaunchAgent(appPath: string, hour: number, minute: number): void {
  // Ensure LaunchAgents dir exists
  if (!fs.existsSync(LAUNCH_AGENTS_DIR)) {
    fs.mkdirSync(LAUNCH_AGENTS_DIR, { recursive: true })
  }

  // Bootout existing agent if present
  bootout()

  // Write new plist
  const plist = buildPlist(appPath, hour, minute)
  fs.writeFileSync(PLIST_PATH, plist)

  // Bootstrap agent (modern launchctl)
  const uid = getUid()
  if (uid) {
    execFileSync('/bin/launchctl', ['bootstrap', `gui/${uid}`, PLIST_PATH], { encoding: 'utf-8' })
  } else {
    // Fallback to legacy load if uid detection fails
    execFileSync('/bin/launchctl', ['load', PLIST_PATH], { encoding: 'utf-8' })
  }
}

export function uninstallLaunchAgent(): void {
  bootout()
  if (fs.existsSync(PLIST_PATH)) {
    fs.unlinkSync(PLIST_PATH)
  }
}

/**
 * Set a wake schedule via pmset.
 * Wakes the Mac 5 minutes before the scheduled check.
 * Requires sudo — will prompt for password via osascript.
 */
export function setWakeSchedule(hour: number, minute: number): { success: boolean; error?: string } {
  // Wake 5 minutes before
  let wakeMinute = minute - 5
  let wakeHour = hour
  if (wakeMinute < 0) {
    wakeMinute += 60
    wakeHour = (wakeHour - 1 + 24) % 24
  }

  const timeStr = `${pad2(wakeHour)}:${pad2(wakeMinute)}:00`
  const command = `sudo pmset repeat wakeorpoweron MTWRFSU ${timeStr}`

  try {
    // Use osascript to get sudo privileges with a GUI prompt
    execFileSync('/usr/bin/osascript', [
      '-e',
      `do shell script "${command}" with administrator privileges`,
    ], { encoding: 'utf-8', timeout: 30_000 })
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to set wake schedule'
    return { success: false, error: message }
  }
}

export function clearWakeSchedule(): { success: boolean; error?: string } {
  try {
    execFileSync('/usr/bin/osascript', [
      '-e',
      'do shell script "sudo pmset repeat cancel" with administrator privileges',
    ], { encoding: 'utf-8', timeout: 30_000 })
    return { success: true }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to clear wake schedule'
    return { success: false, error: message }
  }
}

export function isInstalled(): boolean {
  return fs.existsSync(PLIST_PATH)
}
