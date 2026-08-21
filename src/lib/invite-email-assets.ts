import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ASSETS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../assets/email")
const ICONS_DIR = resolve(ASSETS_DIR, "icons")

export type InviteEmailImageRefs = {
  logo: string
  hero: string
  iconInvite: string
  iconShield: string
  iconLock: string
  iconHeadset: string
  iconClock: string
}

export type InviteEmailAttachment = {
  filename: string
  path: string
  cid: string
  contentType: string
}

const CID = {
  logo: "invite-logo@clinmax",
  hero: "invite-hero@clinmax",
  iconInvite: "invite-icon-mail@clinmax",
  iconShield: "invite-icon-shield@clinmax",
  iconLock: "invite-icon-lock@clinmax",
  iconHeadset: "invite-icon-headset@clinmax",
  iconClock: "invite-icon-clock@clinmax",
} as const

function assetPath(...parts: string[]): string {
  return resolve(ASSETS_DIR, ...parts)
}

function toDataUri(filename: string, mime: string, baseDir = ASSETS_DIR): string {
  const buffer = readFileSync(resolve(baseDir, filename))
  return `data:${mime};base64,${buffer.toString("base64")}`
}

function cidRef(id: string): string {
  return `cid:${id}`
}

/** Preview local (arquivo HTML no navegador). */
export function getInviteEmailInlineImages(): InviteEmailImageRefs {
  return {
    logo: toDataUri("clinmax-logo-email.png", "image/png"),
    hero: toDataUri("invite-hero-email.png", "image/png"),
    iconInvite: toDataUri("invite.png", "image/png", ICONS_DIR),
    iconShield: toDataUri("shield.png", "image/png", ICONS_DIR),
    iconLock: toDataUri("lock.png", "image/png", ICONS_DIR),
    iconHeadset: toDataUri("headset.png", "image/png", ICONS_DIR),
    iconClock: toDataUri("clock.png", "image/png", ICONS_DIR),
  }
}

/** SMTP real: CID inline (Gmail não exibe data: URI). */
export function getInviteEmailAttachments(): {
  attachments: InviteEmailAttachment[]
  images: InviteEmailImageRefs
} {
  const attachments: InviteEmailAttachment[] = [
    {
      filename: "logo.png",
      path: assetPath("clinmax-logo-email.png"),
      cid: CID.logo,
      contentType: "image/png",
    },
    {
      filename: "hero.png",
      path: assetPath("invite-hero-email.png"),
      cid: CID.hero,
      contentType: "image/png",
    },
    {
      filename: "icon-invite.png",
      path: assetPath("icons", "invite.png"),
      cid: CID.iconInvite,
      contentType: "image/png",
    },
    {
      filename: "icon-shield.png",
      path: assetPath("icons", "shield.png"),
      cid: CID.iconShield,
      contentType: "image/png",
    },
    {
      filename: "icon-lock.png",
      path: assetPath("icons", "lock.png"),
      cid: CID.iconLock,
      contentType: "image/png",
    },
    {
      filename: "icon-headset.png",
      path: assetPath("icons", "headset.png"),
      cid: CID.iconHeadset,
      contentType: "image/png",
    },
    {
      filename: "icon-clock.png",
      path: assetPath("icons", "clock.png"),
      cid: CID.iconClock,
      contentType: "image/png",
    },
  ]

  return {
    attachments,
    images: {
      logo: cidRef(CID.logo),
      hero: cidRef(CID.hero),
      iconInvite: cidRef(CID.iconInvite),
      iconShield: cidRef(CID.iconShield),
      iconLock: cidRef(CID.iconLock),
      iconHeadset: cidRef(CID.iconHeadset),
      iconClock: cidRef(CID.iconClock),
    },
  }
}
