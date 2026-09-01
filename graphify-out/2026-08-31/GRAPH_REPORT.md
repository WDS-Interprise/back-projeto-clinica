# Graph Report - back-projeto-clinica  (2026-08-26)

## Corpus Check
- 243 files · ~320,051 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1942 nodes · 4782 edges · 109 communities (87 shown, 22 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 93 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bdd6a548`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- prescription.service.ts
- whatsapp-ai.service.ts
- whatsapp-booking-orchestrator.ts
- avatar.service.ts
- prisma.ts
- appointments.controller.ts
- state-machines.test.ts
- bulas.service.ts
- plan.service.ts
- seed.ts
- consultaremedios.client.ts
- clinmax-pay.service.ts
- saas-billing.controller.ts
- whatsapp.controller.ts
- mail.service.ts
- whatsapp-reminder.service.ts
- exames.service.ts
- finance.service.ts
- backoffice.service.ts
- message-store.ts
- invite-email-assets.ts
- auth.controller.ts
- encounters.controller.ts
- doctor.service.ts
- invite.service.ts
- clinic-roles.ts
- Operação do PM2 na VPS
- whatsapp.service.ts
- manager.ts
- whatsapp-ai-tools.service.ts
- ctxFromRequest
- invite.routes.ts
- auth.service.ts
- compilerOptions
- vacinas.service.ts
- ai-permissions.ts
- audit-log.ts
- medicamentos.service.ts
- dependencies
- encounter.service.ts
- whatsapp-messaging.service.ts
- plan-entitlements.ts
- attendance-ai.service.ts
- appointmentDoctorFilter
- patients.controller.ts
- appointment.service.ts
- devDependencies
- subscription-billing.service.ts
- permissions.ts
- platform-settings.service.ts
- bulapi.client.ts
- scripts
- medicine-aliases.ts
- types/index.ts
- asaas.client.ts
- openrouter.ts
- anvisa.client.ts
- pharmadb.client.ts
- prescription-pdf.ts
- bula-sections.ts
- test-bucket-connection-http.ts
- writeAuditLog
- tiss.service.ts
- zod
- auth-db.ts
- whatsapp-satisfaction-orchestrator.ts
- signature/types.ts
- users.controller.ts
- agenda-note.service.ts
- waiting-list.service.ts
- test-sepurin-search.ts
- src/index.ts
- clinics.routes.ts
- auth-context.ts
- validate-pm2-registration.test.cjs
- deliverQueuedPrescriptionShare
- outros.controller.ts
- satisfaction.service.ts
- records.controller.ts
- assert-dist-no-alias.cjs
- package.json
- build-email-hero.ts
- build-email-icons.ts
- env.ts
- probe-geninfra-creds.ts
- test-s3.ts
- agenda-notes.controller.ts
- clean-patients-and-appointments.ts
- create-admin-user.ts
- ensure-wa-templates.mjs
- list-patients.ts
- probe-geninfra.ts
- test-s3-endpoints.ts
- @aws-sdk/client-s3
- @fastify/cors
- prescription-share.ts
- nodemailer
- state-machines/types.ts
- @prisma/client
- waiting-list.controller.ts
- README.md
- test-models-quick.ts
- JwtPayload
- qrcode
- outbox.service.ts
- medicamentos.controller.ts

## God Nodes (most connected - your core abstractions)
1. `ctxFromRequest()` - 76 edges
2. `prisma` - 65 edges
3. `executeAiTool()` - 38 edges
4. `writeAuditLog()` - 33 edges
5. `tryDeterministicBooking()` - 33 edges
6. `AuthContext` - 30 edges
7. `appointmentDoctorFilter()` - 26 edges
8. `moneyFromUnknown()` - 26 edges
9. `generateAiReply()` - 26 edges
10. `buildAuthContext()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `assignDefaultRoleToUserClinic()`  [EXTRACTED]
  prisma/seed.ts → src/lib/clinic-roles.ts
- `main()` --calls--> `ensureDefaultClinicRoles()`  [EXTRACTED]
  prisma/seed.ts → src/lib/clinic-roles.ts
- `main()` --calls--> `ensurePlatformPlansAndSettings()`  [EXTRACTED]
  prisma/seed.ts → src/lib/saas-billing-seed.ts
- `main()` --calls--> `isMailConfigured()`  [EXTRACTED]
  scripts/test-invite-mail.ts → src/lib/env.ts
- `seedCid10()` --calls--> `buildCid10SearchText()`  [EXTRACTED]
  prisma/seed-cid10.ts → src/lib/cid-types.ts

## Import Cycles
- None detected.

## Communities (109 total, 22 thin omitted)

### Community 0 - "prescription.service.ts"
Cohesion: 0.13
Nodes (25): assertPrescriptionEditable(), prescriptionFinalizeIsIdempotent(), PrescriptionPdfData, addItem(), assertAppointmentInClinic(), assertEncounterInClinic(), assertPatientInClinic(), buildPrescriptionSnapshot() (+17 more)

### Community 1 - "whatsapp-ai.service.ts"
Cohesion: 0.08
Nodes (45): CLINIC_TIMEZONE, CLINIC_TIMEZONE_LABEL, clinicAddDaysIso(), clinicDateParts(), clinicDayPeriod, clinicDayPeriodLabel(), clinicGreeting(), clinicNowClock() (+37 more)

### Community 2 - "whatsapp-booking-orchestrator.ts"
Cohesion: 0.12
Nodes (47): BookingState, botAskedPeriodChoice(), botOfferedAfternoonStart(), botOfferedTomorrow(), extractTimeFromAnyText(), filterSlotsByPeriod(), HANDOFF_TIMEOUT_MS, hasCompleteBookingDraft() (+39 more)

### Community 3 - "avatar.service.ts"
Cohesion: 0.12
Nodes (39): createS3Client(), isStorageUploadConfigured(), publicUrlForKey(), storageConfig(), uploadObject(), ALLOWED_MIME, authHeaders(), avatarFileName() (+31 more)

### Community 5 - "appointments.controller.ts"
Cohesion: 0.29
Nodes (13): aiDraft(), charge(), create(), ctxFromReq(), getById(), list(), nextSlot(), receipt() (+5 more)

### Community 6 - "state-machines.test.ts"
Cohesion: 0.08
Nodes (27): APPOINTMENT_TRANSITIONS, CLINICAL_STATUSES, clinicalStatusRequiresRecordsWrite(), isClinicalStatusTransition(), assertEncounterCanAddendum(), assertEncounterCanEdit(), assertEncounterTransition(), ENCOUNTER_STATUSES (+19 more)

### Community 7 - "bulas.service.ts"
Cohesion: 0.14
Nodes (35): splitClasses(), buildDetailFromConsultaRemedios(), buildPayload(), BulapiSubstanceCandidate, BulaSource, dedupeAnvisaItems(), dedupeBulapiSearch(), fetchAndBuildDetail() (+27 more)

### Community 8 - "plan.service.ts"
Cohesion: 0.08
Nodes (44): annualEquivalentMonthly(), COMMERCIAL_PLAN_SLUGS, COMMERCIAL_PLANS, CommercialPlanDef, CommercialPlanSlug, COMPARISON_ROWS, ComparisonKind, ComparisonRowDef (+36 more)

### Community 9 - "seed.ts"
Cohesion: 0.09
Nodes (27): SAMPLE, seedCid10(), SAMPLE, seedCid11(), seedCidInss(), main(), prisma, buildCid10SearchText() (+19 more)

### Community 10 - "consultaremedios.client.ts"
Cohesion: 0.22
Nodes (17): dedupeParagraphs(), splitDizeresLegais(), CR_TIMEOUT_MS, extractClasses(), extractLaboratorio(), extractLeafletSections(), extractRegistroMs(), fetchConsultaRemediosBula() (+9 more)

### Community 11 - "clinmax-pay.service.ts"
Cohesion: 0.16
Nodes (29): fromCents(), moneyFromUnknown(), roundMoney(), toCents(), detectPixKeyType(), isCpfChecksum(), maskPixKey(), normalizePixKey() (+21 more)

### Community 12 - "saas-billing.controller.ts"
Cohesion: 0.19
Nodes (29): cancelClinicUpgrade(), cancelSubscription(), changeClinicPlan(), changeSubscriptionPlan(), createPlan(), createSubscriptionInvoice(), duplicatePlan(), extendTrial() (+21 more)

### Community 13 - "whatsapp.controller.ts"
Cohesion: 0.19
Nodes (31): createChat(), createConnection(), createTemplate(), ctxFromReq(), deleteTemplate(), disconnect(), getChatAvatar(), getSettings() (+23 more)

### Community 14 - "mail.service.ts"
Cohesion: 0.23
Nodes (14): main(), isMailConfigured(), MAIL_SMTP_HOST, MAIL_SMTP_PASS, MAIL_SMTP_PORT, resolveMailFrom(), rejectJoinRequest(), createTransport() (+6 more)

### Community 15 - "whatsapp-reminder.service.ts"
Cohesion: 0.14
Nodes (21): enqueueOutbox(), processOutboxItem(), processPendingOutbox(), resolveDefaultConnectionId(), findPatientWhatsappChat(), getPatientWhatsappDigits(), patientChatSelect, PatientOutboundTarget (+13 more)

### Community 16 - "exames.service.ts"
Cohesion: 0.11
Nodes (22): getExameByCode(), searchExames(), autocompleteTuss(), getTussByCode(), listTuss(), normalizeListResponse(), searchTuss(), TUSS_TIMEOUT_MS (+14 more)

### Community 17 - "finance.service.ts"
Cohesion: 0.13
Nodes (23): assertClinicEntity(), createTransaction(), decimalToNumber(), ensureDefaultFinanceSetup(), financialAnalysis(), getCashFlow(), getFinanceSettings(), getSummary() (+15 more)

### Community 18 - "backoffice.service.ts"
Cohesion: 0.05
Nodes (63): createClinic(), createUser(), getUser(), listClinics(), listPatients(), listUsers(), login(), me() (+55 more)

### Community 19 - "message-store.ts"
Cohesion: 0.21
Nodes (17): createChat(), dedupeByWaMessageId(), ensureChat(), extractText(), findExistingChatByPhone(), findPatientByPhone(), handleMessagesUpsert(), persistInboundMessage() (+9 more)

### Community 20 - "invite-email-assets.ts"
Cohesion: 0.16
Nodes (22): main(), sample, assetPath(), ASSETS_DIR, CID, cidRef(), getInviteEmailAttachments(), getInviteEmailInlineImages() (+14 more)

### Community 21 - "auth.controller.ts"
Cohesion: 0.13
Nodes (21): completeOnboarding(), GOOGLE_ERROR_MESSAGES, googleAuthCallback(), googleAuthStart(), login(), me(), meAvatar(), register() (+13 more)

### Community 22 - "encounters.controller.ts"
Cohesion: 0.45
Nodes (11): addAddendum(), aiDraft(), complete(), ctxFromReq(), getById(), mapError(), recentByPatient(), resolve() (+3 more)

### Community 24 - "invite.service.ts"
Cohesion: 0.14
Nodes (21): generateInviteToken(), normalizeInviteCode(), getRedirectPath(), acceptInviteToken(), approveJoinRequest(), buildAuthSession(), createEmailInvite(), ensureClinicInviteCode() (+13 more)

### Community 25 - "clinic-roles.ts"
Cohesion: 0.22
Nodes (18): ALL_CONFIGURABLE_PERMISSIONS, assignDefaultRoleToUserClinic(), ClinicRoleDto, ensureDefaultClinicRoles(), ensureUsersLinkedToSystemRoles(), parsePermissionsJson(), PERMISSION_GROUPS, presentClinicRole() (+10 more)

### Community 26 - "Operação do PM2 na VPS"
Cohesion: 0.18
Nodes (10): 1. Selecionar o Node permanente, 2. Instalar e chamar o PM2 pelo mesmo Node, 3. Fazer backup do estado atual, 4. Corrigir o registro da clinmax-api, se necessário, 5. Regenerar o serviço systemd, 6. Validar a unit e os processos, 7. Testar um reboot planejado, Atualização futura do Node (+2 more)

### Community 27 - "whatsapp.service.ts"
Cohesion: 0.22
Nodes (22): assertConnectionAccess(), disconnect(), ensureConnectionRuntime(), getConnectionStatus(), isResumableStatus(), listConnections(), logout(), makeUpdater() (+14 more)

### Community 28 - "manager.ts"
Cohesion: 0.13
Nodes (19): composingUntilByJid, setContactComposing(), bindConnectionHandlers(), bindMessageHandlers(), ConnectionRuntimeUpdate, createSocket(), getStatusCode(), openWhatsAppSession() (+11 more)

### Community 29 - "whatsapp-ai-tools.service.ts"
Cohesion: 0.13
Nodes (32): canExecuteToolInMode(), isToolAllowed(), doctorNameMatchesQuery(), formatDoctorForPatientListing(), isDoctorVisibleToPatients(), extractPhoneDigitsFromText(), formatPhoneBrDisplay(), fromParts() (+24 more)

### Community 30 - "ctxFromRequest"
Cohesion: 0.06
Nodes (73): createRole(), getRole(), listRoles(), removeRole(), resetRole(), updateRole(), appointmentPayGet(), asaasWebhook() (+65 more)

### Community 31 - "invite.routes.ts"
Cohesion: 0.25
Nodes (21): acceptInvite(), acceptInviteSchema, approveClinicJoinRequest(), approveJoinSchema, clinicRoleEnum, createClinicInvite(), createInviteSchema, handleError() (+13 more)

### Community 32 - "auth.service.ts"
Cohesion: 0.21
Nodes (17): JWT_EXPIRES, AuthUserRow, buildAuthSession(), completeOnboarding(), generateToken(), getMe(), isProvisionedByClinic(), loadUserClinics() (+9 more)

### Community 33 - "compilerOptions"
Cohesion: 0.06
Nodes (32): dist, js, json, mjs, node_modules, src, **/*.test.ts, compilerOptions (+24 more)

### Community 34 - "vacinas.service.ts"
Cohesion: 0.13
Nodes (16): searchVacinas(), RXTERMS_TIMEOUT_MS, rxtermsFetch(), RxTermsRawResponse, searchRxTerms(), CacheEntry, FALLBACK_VACCINES, fetchFromApi() (+8 more)

### Community 35 - "ai-permissions.ts"
Cohesion: 0.19
Nodes (13): AI_PERMISSION_KEYS, AiMode, aiModeFromLegacy(), AiPermissionKey, AiPermissions, buildAiToolsDoc(), DEFAULT_AI_PERMISSIONS, legacyFlagsFromAiMode() (+5 more)

### Community 36 - "audit-log.ts"
Cohesion: 0.21
Nodes (12): AuditChainInput, computeAuditEventHash(), ALLOWED_METADATA_KEYS, sanitizeAuditMetadata(), canonicalJson(), hashCanonical(), hmacSha256Hex(), sha256Hex() (+4 more)

### Community 37 - "medicamentos.service.ts"
Cohesion: 0.16
Nodes (19): formatRegulatoryCategory(), REGULATORY_LABELS, buildFallback(), CacheEntry, countProductsBySubstance(), enrichProductsWithPrices(), getMedicamentoProduto(), mapBulapiSearch() (+11 more)

### Community 38 - "dependencies"
Cohesion: 0.09
Nodes (23): bcryptjs, date-fns, dotenv, fastify, @fastify/jwt, @fastify/multipart, @hapi/boom, jsonwebtoken (+15 more)

### Community 39 - "encounter.service.ts"
Cohesion: 0.24
Nodes (19): assertCanWriteRecords(), assertOptimisticLock(), assertOwnsClinicalResource(), assertAppointmentStatusTransition(), addAddendum(), audit(), ClinicalEncounterInput, clinicalFromAppointment() (+11 more)

### Community 40 - "whatsapp-messaging.service.ts"
Cohesion: 0.19
Nodes (24): assertConnectionForClinic(), findUsableConnection(), listChatMessages(), listChats(), reconcileChatPhoneDigits(), sendDocumentNow(), sendFromContext(), sendMessageNow() (+16 more)

### Community 41 - "plan-entitlements.ts"
Cohesion: 0.13
Nodes (23): assertClinicFeature(), assertClinicLimit(), checkClinicLimit(), ClinicEntitlements, clinicHasFeature(), countDoctors(), countUsers(), countWhatsappConnections() (+15 more)

### Community 42 - "attendance-ai.service.ts"
Cohesion: 0.39
Nodes (7): AttendanceAiDraft, EMPTY, parseDraft(), runDraftPrompt(), suggestAttendanceDraft(), suggestAttendanceDraftForEncounter(), listRecentByPatient()

### Community 43 - "appointmentDoctorFilter"
Cohesion: 0.19
Nodes (16): appointmentDoctorFilter(), remove(), clinicWhere(), dayStatusCounts(), getPanelMetrics(), getStats(), getTodayPatients(), getUpcomingAppointments() (+8 more)

### Community 44 - "patients.controller.ts"
Cohesion: 0.14
Nodes (21): archive(), create(), ctxFromReq(), getById(), getHistory(), list(), lookup(), sendMatchConflict() (+13 more)

### Community 45 - "appointment.service.ts"
Cohesion: 0.12
Nodes (40): addMinutesToTime(), AgendaRow, AgendaSchedule, buildAgendaRows(), DEFAULT_AGENDA_SCHEDULE, generateAgendaSlots(), isWithinWorkHours(), minutesToTime() (+32 more)

### Community 46 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, prisma, tsc-alias, tsx, @types/bcryptjs, @types/jsonwebtoken, @types/node, @types/nodemailer (+11 more)

### Community 47 - "subscription-billing.service.ts"
Cohesion: 0.19
Nodes (21): isAsaasConfigured(), AsaasPaymentPayload, BillingRequirementError, cancelAsaasSubscription(), cancelPendingUpgradeInvoices(), createManualInvoice(), ensureClinicAsaasCustomer(), ensureInvoiceForAsaasPayment() (+13 more)

### Community 48 - "permissions.ts"
Cohesion: 0.19
Nodes (15): ctxFromReq(), getCid10ByCodigo(), getCid10Capitulos(), getCid10Grupos(), getCid11Blocos(), getCid11ByCodigo(), getCid11Capitulos(), getCidInss() (+7 more)

### Community 50 - "bulapi.client.ts"
Cohesion: 0.12
Nodes (6): BULAPI_TIMEOUT_MS, BulapiMeta, BulapiPresentation, BulapiPriceEntry, BulapiProduct, BulapiSearchResponse

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, db:migrate, db:push, db:seed, db:setup, db:studio, dev (+8 more)

### Community 52 - "medicine-aliases.ts"
Cohesion: 0.24
Nodes (12): queries, expandMedicineQueryTerms(), findMedicineAliasByKey(), GENERIC_SALT_TOKENS, isGenericSaltToken(), matchMedicineAliases(), MEDICINE_ALIASES, MedicineAliasEntry (+4 more)

### Community 53 - "types/index.ts"
Cohesion: 0.16
Nodes (7): assertClinicScoped(), assertHasPermission(), getById(), list(), remove(), update(), AuthContext

### Community 54 - "asaas.client.ts"
Cohesion: 0.17
Nodes (18): AsaasApiError, AsaasCreditCard, AsaasCreditCardHolder, AsaasErrorBody, asaasFetch(), cancelTransfer(), createCreditCardPayment(), createCustomer() (+10 more)

### Community 55 - "openrouter.ts"
Cohesion: 0.19
Nodes (14): history, messages, stored, messages, chatCompletion(), chatCompletionWithFallback(), extractTextFromReasoningDetails(), getApiKey() (+6 more)

### Community 56 - "anvisa.client.ts"
Cohesion: 0.20
Nodes (9): ANVISA_TIMEOUT_MS, AnvisaBulaItem, anvisaBulaPdfUrl(), anvisaBulaUrl(), anvisaFetch(), anvisaHeaders(), AnvisaListResponse, fetchAnvisaBulaRaw() (+1 more)

### Community 57 - "pharmadb.client.ts"
Cohesion: 0.22
Nodes (10): fetchPharmadbBula(), fetchPharmadbBulaById(), getToken(), normalizeTerm(), PHARMADB_TIMEOUT_MS, PharmadbBulaDetail, PharmadbBulaSummary, PharmadbToken (+2 more)

### Community 58 - "prescription-pdf.ts"
Cohesion: 0.25
Nodes (19): buildFooterDoctorLine(), buildHeaderDoctorLines(), buildMedicationHeadline(), buildMedicationSubtitle(), buildPrescriptionHtml(), buildSignatureBlock(), buildValidateDisplayUrl(), buildValidateUrl() (+11 more)

### Community 59 - "bula-sections.ts"
Cohesion: 0.11
Nodes (21): BULA_SECTION_LABELS, cleanText(), countFilledSections(), matchSectionKey(), normalizeHeading(), parseBulaText(), ParsedBulaSections, parsedToBulaSecoes() (+13 more)

### Community 60 - "test-bucket-connection-http.ts"
Cohesion: 0.33
Nodes (10): authHeaders(), cfg(), extractDownloadUrl(), extractFileId(), extractUploadHeaders(), extractUploadMethod(), extractUploadUrl(), JsonRecord (+2 more)

### Community 62 - "writeAuditLog"
Cohesion: 0.25
Nodes (17): writeAuditLog(), computeTrialEnd(), attachPendingUpgrade(), cancelPendingUpgradeByClinic(), cancelSubscription(), changePlan(), extendTrial(), getClinicDetail() (+9 more)

### Community 66 - "auth-db.ts"
Cohesion: 0.36
Nodes (8): ensureDbAuthState(), loadStored(), lockFor(), locks, parseAuthData(), saveStored(), StoredAuth, useDbAuthState()

### Community 67 - "whatsapp-satisfaction-orchestrator.ts"
Cohesion: 0.25
Nodes (16): systemAuthContext(), mergeAiContext(), parseAiContext(), stringifyAiContext(), WhatsappAiContext, createSurveyForAppointment(), looksLikeThanks(), markSurveySent() (+8 more)

### Community 68 - "signature/types.ts"
Cohesion: 0.17
Nodes (9): getSignatureProvider(), StubSignatureProvider, classifySignatureLabel(), CreateSignatureInput, DigitalSignatureProvider, SIGNATURE_PROVIDERS, SignatureLegalClass, SignatureProviderId (+1 more)

### Community 69 - "users.controller.ts"
Cohesion: 0.61
Nodes (6): clinicId(), create(), getById(), list(), setLinkedDoctors(), update()

### Community 70 - "agenda-note.service.ts"
Cohesion: 0.39
Nodes (7): create(), getById(), include, list(), parseNoteDate(), remove(), update()

### Community 71 - "waiting-list.service.ts"
Cohesion: 0.39
Nodes (6): doctorWhere(), getById(), include, list(), remove(), update()

### Community 72 - "test-sepurin-search.ts"
Cohesion: 0.48
Nodes (6): anvisaNome(), anvisaPA(), bulapi(), cr(), main(), tests

### Community 73 - "src/index.ts"
Cohesion: 0.17
Nodes (11): app, createSchema, finalizeSchema, itemSchema, prescriptionsRoutes(), publicPrescriptionRoutes(), resendWhatsappSchema, updateSchema (+3 more)

### Community 74 - "clinics.routes.ts"
Cohesion: 0.52
Nodes (5): create(), getById(), list(), remove(), update()

### Community 75 - "auth-context.ts"
Cohesion: 0.24
Nodes (9): create(), getById(), list(), remove(), update(), buildAuthContext(), jwtFromRequest(), RequestWithUser (+1 more)

### Community 76 - "validate-pm2-registration.test.cjs"
Cohesion: 0.11
Nodes (21): { resolvePermanentNvmNode }, assertPermanentNvmNode(), fs, normalizedPath(), path, resolvePermanentNvmNode(), {
  assertPermanentNvmNode,
  normalizedPath,
}, fs (+13 more)

### Community 77 - "deliverQueuedPrescriptionShare"
Cohesion: 0.22
Nodes (12): buildPrescriptionFilename(), formatFilenameDate(), getBrowser(), htmlToPdfBuffer(), slugify(), buildWhatsAppMessage(), deliverQueuedPrescriptionShare(), generatePrescriptionPdfBuffer() (+4 more)

### Community 78 - "outros.controller.ts"
Cohesion: 0.38
Nodes (9): ctxFromReq(), getBula(), getCid10Code(), listCid10Chapters(), listContacts(), listLogs(), searchBulas(), searchCid10() (+1 more)

### Community 80 - "records.controller.ts"
Cohesion: 0.42
Nodes (7): create(), ctxFromReq(), getById(), list(), remove(), update(), recordSchema

### Community 81 - "assert-dist-no-alias.cjs"
Cohesion: 0.33
Nodes (4): distDir, fs, hits, path

### Community 82 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 83 - "build-email-hero.ts"
Cohesion: 0.40
Nodes (3): OUT, ROOT, SRC

### Community 84 - "build-email-icons.ts"
Cohesion: 0.40
Nodes (3): ICON_BG, ICONS, OUT_DIR

### Community 85 - "env.ts"
Cohesion: 0.10
Nodes (23): DEFAULT_PRODUCTION_ORIGINS, parseCsvOrigins(), resolveCorsOrigins(), ASAAS_API_KEY, ASAAS_BASE_URL, ASAAS_CUSTOMER_ID, ASAAS_PIX_KEY, ASAAS_WEBHOOK_EMAIL (+15 more)

### Community 87 - "test-s3.ts"
Cohesion: 0.67
Nodes (3): main(), tryVariant(), variants

### Community 88 - "agenda-notes.controller.ts"
Cohesion: 0.67
Nodes (5): create(), ctxFromReq(), list(), remove(), update()

### Community 97 - "prescription-share.ts"
Cohesion: 0.50
Nodes (3): SHARE_STATUSES, SHARE_TRANSITIONS, ShareMachineStatus

### Community 101 - "waiting-list.controller.ts"
Cohesion: 0.67
Nodes (5): create(), ctxFromReq(), list(), remove(), update()

### Community 105 - "JwtPayload"
Cohesion: 0.38
Nodes (6): fastify, @fastify/jwt, FastifyInstance, FastifyJWT, FastifyRequest, JwtPayload

### Community 107 - "outbox.service.ts"
Cohesion: 0.47
Nodes (4): finalize(), enqueueOutbox(), nextBackoffMs(), processClinicalOutbox()

## Knowledge Gaps
- **332 isolated node(s):** `{ resolvePermanentNvmNode }`, `name`, `version`, `private`, `type` (+327 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `prisma` connect `prisma.ts` to `prescription.service.ts`, `whatsapp-ai.service.ts`, `whatsapp-booking-orchestrator.ts`, `avatar.service.ts`, `plan.service.ts`, `seed.ts`, `clinmax-pay.service.ts`, `whatsapp.controller.ts`, `whatsapp-reminder.service.ts`, `finance.service.ts`, `backoffice.service.ts`, `message-store.ts`, `doctor.service.ts`, `invite.service.ts`, `clinic-roles.ts`, `whatsapp.service.ts`, `manager.ts`, `whatsapp-ai-tools.service.ts`, `auth.service.ts`, `encounter.service.ts`, `whatsapp-messaging.service.ts`, `plan-entitlements.ts`, `appointmentDoctorFilter`, `patients.controller.ts`, `appointment.service.ts`, `subscription-billing.service.ts`, `platform-settings.service.ts`, `types/index.ts`, `openrouter.ts`, `bula-sections.ts`, `clinic.service.ts`, `writeAuditLog`, `inventory.service.ts`, `tiss.service.ts`, `auth-db.ts`, `whatsapp-satisfaction-orchestrator.ts`, `agenda-note.service.ts`, `waiting-list.service.ts`, `src/index.ts`, `auth-context.ts`, `satisfaction.service.ts`, `outbox.service.ts`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Why does `buildAuthContext()` connect `auth-context.ts` to `appointments.controller.ts`, `waiting-list.controller.ts`, `src/index.ts`, `patients.controller.ts`, `whatsapp.controller.ts`, `outros.controller.ts`, `permissions.ts`, `records.controller.ts`, `encounters.controller.ts`, `agenda-notes.controller.ts`, `clinic-roles.ts`, `ctxFromRequest`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `ctxFromRequest()` connect `ctxFromRequest` to `auth-context.ts`, `outbox.service.ts`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `executeAiTool()` (e.g. with `formatDoctorForPatientListing()` and `isDoctorVisibleToPatients()`) actually correct?**
  _`executeAiTool()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `{ resolvePermanentNvmNode }`, `name`, `version` to the rest of the system?**
  _332 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `prescription.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.13118279569892474 - nodes in this community are weakly interconnected._
- **Should `whatsapp-ai.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08235294117647059 - nodes in this community are weakly interconnected._