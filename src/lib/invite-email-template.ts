import type { InviteEmailImageRefs } from "@/lib/invite-email-assets.js"
import { formatCompanyCopyright, formattedCompanyCnpj } from "@/lib/company-legal.js"

export type ClinicInviteEmailContent = {
  clinicName: string
  roleLabel: string
  inviteUrl: string
  inviteCode: string
  invitedByName: string
  inviteeEmail: string
  expiresInDays?: number
}

const COLORS = {
  green: "#008A5B",
  greenAccent: "#00875A",
  greenBorder: "#19A974",
  mintSoft: "#EFFAF5",
  mintCircle: "#E3F6EC",
  card: "#F3FAF7",
  benefits: "#F6FBF8",
  textPrimary: "#17251F",
  textSecondary: "#64716B",
  textBody: "#69756F",
  textMuted: "#8A958F",
  textBenefit: "#57645E",
  textFooter: "#55625C",
  textFooterMuted: "#89938E",
  separator: "#DCE4E0",
  separatorText: "#808A85",
  borderBenefit: "#DFE9E4",
  background: "#F6F8F7",
  white: "#FFFFFF",
} as const

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function inviteeGreeting(email: string): string {
  const local = email.split("@")[0]?.split(/[.+_-]/)[0]?.trim() ?? ""
  if (!local || local.length < 2) return "Olá!"
  const name = local.charAt(0).toUpperCase() + local.slice(1).toLowerCase()
  return `Olá, ${name}!`
}

function formatInviteCodeSpaced(code: string): string {
  return esc(code.toUpperCase().split("").join(" "))
}

function iconCell(src: string, size = 24): string {
  return `<img src="${src}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;margin:0 auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />`
}

function iconBenefit(src: string, size = 22): string {
  return `<p style="margin:0 0 8px;line-height:0;font-size:0;">${iconCell(src, size)}</p>`
}

export function buildClinicInviteEmailHtml(
  input: ClinicInviteEmailContent,
  images: InviteEmailImageRefs
): string {
  const greeting = inviteeGreeting(input.inviteeEmail)
  const expiresDays = input.expiresInDays ?? 7
  const clinicName = esc(input.clinicName.trim())
  const roleLabel = esc(input.roleLabel)
  const invitedByName = esc(input.invitedByName.toUpperCase())
  const inviteUrl = esc(input.inviteUrl)
  const inviteCodeSpaced = formatInviteCodeSpaced(input.inviteCode)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Convite ClinMax: ${clinicName}</title>
  <style type="text/css">
    body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; mso-table-lspace: 0; mso-table-rspace: 0; border: 0; }
    td { border: 0; mso-line-height-rule: exactly; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; display: block; }
    a { text-decoration: none; border: 0; }
    @media only screen and (max-width: 620px) {
      .email-shell { padding: 0 !important; }
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; padding: 18px !important; }
      .hero-col-left, .hero-col-right { display: block !important; width: 100% !important; max-width: 100% !important; }
      .hero-col-right { padding-top: 16px !important; text-align: center !important; }
      .hero-image-wrap { margin: 0 auto !important; }
      .hero-image { margin: 0 auto !important; }
      .benefit-col { display: block !important; width: 100% !important; max-width: 100% !important; border: 0 !important; padding-top: 14px !important; padding-bottom: 14px !important; }
      .benefit-col-first { padding-top: 0 !important; }
      .footer-logo-col, .footer-text-col { display: block !important; width: 100% !important; text-align: center !important; }
      .footer-text-col { padding-top: 10px !important; padding-left: 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.background};font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.background};">
    <tr>
      <td align="center" class="email-shell" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="email-container" style="width:600px;max-width:600px;background-color:${COLORS.white};border-radius:24px;padding:30px 32px 22px;">

          <tr>
            <td style="padding-bottom:20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:18px;">
                    <img src="${images.logo}" width="168" alt="ClinMax" style="width:168px;max-width:168px;height:auto;margin:0 auto;border:0;outline:none;display:block;" />
                  </td>
                </tr>
                <tr>
                  <td>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" class="hero-col-left" width="52%" style="width:52%;padding-right:8px;padding-left:14px;vertical-align:top;">
                          <p style="margin:0 0 10px;font-size:28px;line-height:1.2;font-weight:700;color:${COLORS.textPrimary};">
                            ${esc(greeting)}
                          </p>
                          <p style="margin:0;font-size:12px;line-height:1.5;color:${COLORS.textBody};">
                            <span style="font-weight:700;color:${COLORS.textPrimary};">${invitedByName}</span>
                            convidou você para integrar a equipe de
                            <span style="font-weight:700;color:${COLORS.greenAccent};">${clinicName}</span>
                            como
                            <span style="font-weight:700;color:${COLORS.greenAccent};">${roleLabel}</span>.
                          </p>
                        </td>
                        <td valign="middle" align="right" class="hero-col-right" width="48%" style="width:48%;vertical-align:middle;border:0;background-color:${COLORS.white};">
                          <img src="${images.hero}" width="220" alt="" class="hero-image" style="width:220px;max-width:100%;height:auto;border:0;outline:none;display:block;margin-left:auto;background-color:${COLORS.white};" />
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.card};border-radius:18px;">
                <tr>
                  <td align="center" style="padding:28px 36px;text-align:center;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px;">
                      <tr>
                        <td align="center" valign="middle" width="56" height="56" style="width:56px;height:56px;border-radius:50%;background-color:${COLORS.mintCircle};">
                          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" height="100%">
                            <tr><td align="center" valign="middle" style="line-height:0;padding-top:4px;">${iconCell(images.iconInvite, 28)}</td></tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0 0 8px;font-size:18px;line-height:1.35;font-weight:700;color:${COLORS.textPrimary};">
                      Convite para <span style="color:${COLORS.greenAccent};">${clinicName}</span>
                    </p>
                    <p style="margin:0 0 22px;font-size:13px;line-height:1.5;color:${COLORS.textSecondary};max-width:420px;margin-left:auto;margin-right:auto;">
                      Você foi convidado para acessar a plataforma ClinMax e colaborar com a gestão de ${clinicName}.
                    </p>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 20px;">
                      <tr>
                        <td align="center" bgcolor="${COLORS.green}" style="border-radius:9px;background-color:${COLORS.green};">
                          <a href="${inviteUrl}" target="_blank" style="display:inline-block;width:160px;height:46px;line-height:46px;font-size:14px;font-weight:700;color:${COLORS.white};text-align:center;">
                            Aceitar convite →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 18px;max-width:320px;">
                      <tr>
                        <td width="42%" style="border-top:1px solid ${COLORS.separator};font-size:0;line-height:0;">&nbsp;</td>
                        <td align="center" width="16%" style="font-size:12px;line-height:1;color:${COLORS.separatorText};padding:0 8px;">ou</td>
                        <td width="42%" style="border-top:1px solid ${COLORS.separator};font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>

                    <p style="margin:0 0 12px;font-size:12px;line-height:1.5;color:${COLORS.textBody};">
                      Use o código da clínica para criar sua conta:
                    </p>

                    <p style="margin:0 0 18px;text-align:center;line-height:0;font-size:0;">
                      <span style="display:inline-block;padding:14px 32px;border-radius:999px;background-color:${COLORS.white};font-size:20px;line-height:1.2;font-weight:700;letter-spacing:6px;color:${COLORS.green};font-family:Consolas,'Courier New',monospace;">
                        ${inviteCodeSpaced}
                      </span>
                    </p>

                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
                      <tr>
                        <td valign="middle" style="padding-right:8px;line-height:0;">
                          ${iconCell(images.iconClock, 16)}
                        </td>
                        <td valign="middle" style="font-size:12px;line-height:1.5;color:${COLORS.textBody};">
                          Este convite expira em ${expiresDays} dias.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding-bottom:8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.benefits};border-radius:16px;">
                <tr>
                  <td style="padding:20px 16px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" align="center" class="benefit-col benefit-col-first" width="33%" style="width:33%;padding:0 10px;vertical-align:top;text-align:center;border:0;">
                          ${iconBenefit(images.iconShield)}
                          <p style="margin:0 0 4px;font-size:11px;line-height:1.35;font-weight:700;color:${COLORS.greenAccent};">Seguro e confiável</p>
                          <p style="margin:0;font-size:10px;line-height:1.45;color:${COLORS.textBenefit};">Seus dados protegidos com total segurança.</p>
                        </td>
                        <td valign="top" align="center" class="benefit-col" width="34%" style="width:34%;padding:0 10px;vertical-align:top;text-align:center;border:0;">
                          ${iconBenefit(images.iconLock)}
                          <p style="margin:0 0 4px;font-size:11px;line-height:1.35;font-weight:700;color:${COLORS.greenAccent};">Acesso personalizado</p>
                          <p style="margin:0;font-size:10px;line-height:1.45;color:${COLORS.textBenefit};">Permissões definidas pelo administrador.</p>
                        </td>
                        <td valign="top" align="center" class="benefit-col" width="33%" style="width:33%;padding:0 10px;vertical-align:top;text-align:center;border:0;">
                          ${iconBenefit(images.iconHeadset)}
                          <p style="margin:0 0 4px;font-size:11px;line-height:1.35;font-weight:700;color:${COLORS.greenAccent};">Suporte dedicado</p>
                          <p style="margin:0;font-size:10px;line-height:1.45;color:${COLORS.textBenefit};">Equipe pronta para te ajudar sempre.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:14px 8px 12px;border:0;">
              <p style="margin:0;font-size:10px;line-height:1.5;color:${COLORS.textMuted};max-width:480px;">
                Este e-mail foi enviado pela plataforma ClinMax (CNPJ ${formattedCompanyCnpj()}) em nome de ${clinicName}. Se você não esperava esta mensagem, ignore.
                <br />${formatCompanyCopyright()}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding-top:4px;padding-bottom:0;border:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" class="footer-logo-col" width="110" style="width:110px;vertical-align:middle;border:0;">
                    <img src="${images.logo}" width="100" alt="ClinMax" style="width:100px;max-width:100px;height:auto;border:0;outline:none;display:block;" />
                  </td>
                  <td valign="middle" class="footer-text-col" style="padding-left:12px;vertical-align:middle;border:0;">
                    <p style="margin:0 0 2px;font-size:12px;line-height:1.3;font-weight:600;color:${COLORS.textFooter};">${clinicName}</p>
                    <p style="margin:0;font-size:9px;line-height:1.4;color:${COLORS.textFooterMuted};">Gestão que transforma. Tecnologia que aproxima.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function buildClinicInviteEmailText(input: ClinicInviteEmailContent): string {
  const greeting = inviteeGreeting(input.inviteeEmail)
  const expiresDays = input.expiresInDays ?? 7
  const clinicName = input.clinicName.trim()

  return [
    greeting,
    "",
    `${input.invitedByName.toUpperCase()} convidou você para integrar a equipe de ${clinicName} como ${input.roleLabel}.`,
    "",
    "Aceite pelo link:",
    input.inviteUrl,
    "",
    `Ou use o código da clínica ao criar sua conta: ${input.inviteCode.toUpperCase()}`,
    "",
    `Este convite expira em ${expiresDays} dias.`,
    "",
    `${clinicName}`,
    "Gestão que transforma. Tecnologia que aproxima.",
    "",
    formatCompanyCopyright(),
  ].join("\n")
}
