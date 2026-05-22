import type { FastifyRequest, FastifyReply } from "fastify"

import * as authService from "@/services/auth.service.js"

import { resolveUserAvatarUrl, uploadUserAvatar } from "@/services/avatar.service.js"



export async function login(req: FastifyRequest, reply: FastifyReply) {

  try {

    const { email, password } = req.body as { email: string; password: string }

    const result = await authService.login(email, password)



    if (!result) {

      return reply.status(401).send({ error: "Credenciais invalidas" })

    }



    return reply.send(result)

  } catch (error: any) {

    if (error.code === "USER_INACTIVE") {

      return reply.status(403).send({ error: "Usuario inativo" })

    }

    if (error.code === "NO_CLINIC") {

      return reply.status(403).send({ error: "Usuario sem clinica vinculada" })

    }

    req.log.error(error)

    return reply.status(500).send({ error: "Erro interno do servidor" })

  }

}



export async function register(req: FastifyRequest, reply: FastifyReply) {

  try {

    const result = await authService.register(req.body as any)

    return reply.status(201).send(result)

  } catch (error: any) {

    if (error.code === "DUPLICATE_FIELDS") {

      return reply.status(409).send({

        error: error.message || "Dados ja cadastrados",

        fields: error.fields ?? {},

      })

    }

    if (error.message === "EMAIL_EXISTS") {

      return reply.status(409).send({

        error: "Este e-mail ja esta cadastrado",

        fields: { email: "Este e-mail ja esta cadastrado no sistema" },

      })

    }

    req.log.error(error)

    return reply.status(500).send({ error: "Erro interno do servidor" })

  }

}



export async function completeOnboarding(req: FastifyRequest, reply: FastifyReply) {

  try {

    const payload = req.user as { userId: string }

    const result = await authService.completeOnboarding(

      payload.userId,

      req.body as { roleLabel: string; teamSize: string; clinicName?: string }

    )

    return reply.send(result)

  } catch (error: any) {

    if (error.message === "NOT_FOUND") {

      return reply.status(404).send({ error: "Usuario nao encontrado" })

    }

    req.log.error(error)

    return reply.status(500).send({ error: "Erro ao concluir configuracao inicial" })

  }

}



export async function me(req: FastifyRequest, reply: FastifyReply) {

  try {

    const payload = req.user as { userId: string; clinicId?: string }

    const user = await authService.getMe(payload.userId, payload.clinicId ?? undefined)



    if (!user) {

      return reply.status(404).send({ error: "Usuario nao encontrado" })

    }



    return reply.send(user)

  } catch (error) {

    req.log.error(error)

    return reply.status(500).send({ error: "Erro interno do servidor" })

  }

}



export async function meAvatar(req: FastifyRequest, reply: FastifyReply) {

  try {

    const payload = req.user as { userId: string }

    const imageUrl = await resolveUserAvatarUrl(payload.userId)

    return reply.send({ imageUrl })

  } catch (error) {

    req.log.error(error)

    return reply.status(500).send({ error: "Erro ao buscar avatar" })

  }

}



export async function uploadMeAvatar(req: FastifyRequest, reply: FastifyReply) {

  try {

    const payload = req.user as { userId: string }

    const file = await req.file()

    if (!file) {

      return reply.status(400).send({ error: "Envie uma imagem (JPEG, PNG ou WebP)" })

    }



    const buffer = await file.toBuffer()

    const imageUrl = await uploadUserAvatar(payload.userId, buffer, file.mimetype)

    return reply.send({ imageUrl })

  } catch (error: unknown) {

    if (error instanceof Error) {

      if (error.message === "INVALID_FILE_TYPE") {

        return reply.status(400).send({ error: "Formato inválido. Use JPEG, PNG ou WebP." })

      }

      if (error.message === "FILE_TOO_LARGE") {

        return reply.status(400).send({ error: "Imagem muito grande. Máximo 5 MB." })

      }

      if (error.message === "STORAGE_NOT_CONFIGURED") {

        return reply.status(503).send({

          error: "Armazenamento de imagens não configurado no servidor.",

        })

      }

      if (
        error.name === "InvalidAccessKeyId" ||
        error.name === "SignatureDoesNotMatch" ||
        (error as { Code?: string }).Code === "InvalidAccessKeyId" ||
        (error as { Code?: string }).Code === "SignatureDoesNotMatch"
      ) {

        return reply.status(503).send({

          error:

            "Credenciais do bucket inválidas ou expiradas. Gere novas chaves no painel GenInfra e atualize o .env.",

        })

      }

      if (error.message === "GENINFRA_UPLOAD_URL_FAILED") {
        const status = (error as { status?: number }).status
        const detail = (error as { detail?: string }).detail
        const isRouteMissing = status === 404 || detail?.includes("Route") || detail?.includes("not found")

        if (status === 500) {
          return reply.status(503).send({
            error:
              "API de buckets respondeu erro interno (500). Provável falha no MinIO — verifique WORKSPACE_S3_* no servidor GenInfra.",
          })
        }

        if (status === 401) {
          return reply.status(503).send({
            error:
              "Token de conexão do bucket inválido ou expirado. Gere nova conexão no painel GenInfra e atualize STORAGE_CONNECTION_TOKEN no .env.",
          })
        }

        return reply.status(503).send({
          error: isRouteMissing
            ? "API de buckets da GenInfra ainda não está no ar (rota upload-url retorna 404). Confirme deploy do back-manager e URLs curtas (.../connection/files/upload-url)."
            : "Falha ao gerar URL de upload no bucket. Verifique token/conexão no painel GenInfra.",
        })
      }

      if (error.message === "GENINFRA_UPLOAD_PUT_FAILED") {

        return reply.status(503).send({

          error: "Falha ao enviar bytes para a URL assinada do bucket.",

        })

      }

    }

    req.log.error(error)

    return reply.status(500).send({ error: "Erro ao enviar foto" })

  }

}



export async function updateMe(req: FastifyRequest, reply: FastifyReply) {

  try {

    const payload = req.user as { userId: string; clinicId?: string }

    const body = req.body as {

      name?: string

      email?: string

      phone?: string

      gender?: "M" | "F" | "O"

      password?: string

      currentPassword?: string

    }



    const user = await authService.updateMe(payload.userId, payload.clinicId, body)

    return reply.send(user)

  } catch (error: any) {

    if (error.code === "NOT_FOUND") {

      return reply.status(404).send({ error: "Usuario nao encontrado" })

    }

    if (error.code === "DUPLICATE_FIELDS") {

      return reply.status(409).send({

        error: error.message || "Dados ja cadastrados",

        fields: error.fields ?? {},

      })

    }

    if (error.code === "CURRENT_PASSWORD_REQUIRED") {

      return reply.status(400).send({ error: "Informe a senha atual para alterar a senha" })

    }

    if (error.code === "INVALID_CURRENT_PASSWORD") {

      return reply.status(401).send({ error: "Senha atual incorreta" })

    }

    if (error.code === "INVALID_PASSWORD") {

      return reply.status(400).send({ error: error.message })

    }

    req.log.error(error)

    return reply.status(500).send({ error: "Erro ao atualizar conta" })

  }

}

