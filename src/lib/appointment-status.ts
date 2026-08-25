export {
  APPOINTMENT_TRANSITIONS as ALLOWED,
  assertAppointmentStatusTransition,
  clinicalStatusRequiresRecordsWrite,
  isClinicalStatusTransition,
} from "@/domain/state-machines/appointment.js"
