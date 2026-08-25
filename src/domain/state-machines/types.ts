export type TransitionActor =
  | "DOCTOR"
  | "ADMIN"
  | "RECEPTION"
  | "SYSTEM"
  | "ANY_CLINICAL"

export type StateTransition<TStatus extends string> = {
  from: TStatus
  to: TStatus
  actors: TransitionActor[]
  permission?: string
  sideEffects: string[]
}
