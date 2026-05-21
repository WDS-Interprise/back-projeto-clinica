const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "Senha deve ter no minimo 8 caracteres"
  if (!PASSWORD_REGEX.test(password)) {
    return "Senha deve ter maiuscula, minuscula, numero e caractere especial"
  }
  return null
}
