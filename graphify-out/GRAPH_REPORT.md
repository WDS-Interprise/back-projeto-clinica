# Graph Report - back-projeto-clinica  (2026-08-21)

## Corpus Check
- 214 files · ~309,152 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1743 nodes · 4332 edges · 106 communities (88 shown, 18 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 85 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `889d7e93`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- prescription.service.ts
- whatsapp-ai.service.ts
- whatsapp-booking-orchestrator.ts
- avatar.service.ts
- prisma.ts
- appointments.controller.ts
- whatsapp-ai-tools.service.ts
- bulas.service.ts
- saas-billing-seed.ts
- import-cid.ts
- bula-sections.ts
- clinmax-pay.service.ts
- saas-billing.controller.ts
- whatsapp.controller.ts
- env.ts
- whatsapp-reminder.service.ts
- exames.service.ts
- finance.service.ts
- patients.controller.ts
- message-store.ts
- invite-email-assets.ts
- auth.controller.ts
- types/index.ts
- appointment.service.ts
- invite.service.ts
- clinic-roles.ts
- plan-entitlements.ts
- whatsapp.service.ts
- manager.ts
- ctxFromRequest
- finance.routes.ts
- invite.routes.ts
- auth.service.ts
- compilerOptions
- vacinas.service.ts
- whatsapp-messaging.service.ts
- backoffice.service.ts
- medicamentos.service.ts
- dependencies
- encounter.service.ts
- sendMessageNow
- openrouter.ts
- duplicate-validation.ts
- appointmentDoctorFilter
- backoffice.routes.ts
- agenda-schedule.ts
- devDependencies
- subscription-billing.service.ts
- cid.controller.ts
- writeAuditLog
- bulapi.client.ts
- scripts
- medicine-aliases.ts
- whatsapp-satisfaction-orchestrator.ts
- asaas.client.ts
- mail.service.ts
- anvisa.client.ts
- pharmadb.client.ts
- src/index.ts
- bula-types.ts
- test-bucket-connection-http.ts
- buildAuthContext
- records.controller.ts
- user.service.ts
- patient.service.ts
- doctor.service.ts
- auth-db.ts
- clinic-role.controller.ts
- clinmax-pay.controller.ts
- users.controller.ts
- agenda-note.service.ts
- waiting-list.service.ts
- test-sepurin-search.ts
- agenda-notes.controller.ts
- clinics.routes.ts
- inventory.controller.ts
- reports.controller.ts
- satisfaction.controller.ts
- waiting-list.controller.ts
- satisfaction.service.ts
- JwtPayload
- record.service.ts
- package.json
- build-email-hero.ts
- build-email-icons.ts
- tiss.controller.ts
- probe-geninfra-creds.ts
- test-s3.ts
- medicamentos.controller.ts
- clean-patients-and-appointments.ts
- create-admin-user.ts
- ensure-wa-templates.mjs
- list-patients.ts
- probe-geninfra.ts
- test-s3-endpoints.ts
- @aws-sdk/client-s3
- @fastify/cors
- @hapi/boom
- nodemailer
- pino
- @prisma/client
- zod
- README.md
- test-models-quick.ts

## God Nodes (most connected - your core abstractions)
1. `ctxFromRequest()` - 72 edges
2. `prisma` - 65 edges
3. `executeAiTool()` - 38 edges
4. `tryDeterministicBooking()` - 33 edges
5. `writeAuditLog()` - 30 edges
6. `AuthContext` - 28 edges
7. `appointmentDoctorFilter()` - 26 edges
8. `generateAiReply()` - 26 edges
9. `buildAuthContext()` - 25 edges
10. `whatsappRoutes()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `ensurePlatformPlansAndSettings()`  [EXTRACTED]
  prisma/seed.ts → src/lib/saas-billing-seed.ts
- `main()` --calls--> `migrateExistingClinicsToLegacy()`  [EXTRACTED]
  prisma/seed.ts → src/lib/saas-billing-seed.ts
- `main()` --calls--> `isMailConfigured()`  [EXTRACTED]
  scripts/test-invite-mail.ts → src/lib/env.ts
- `seedCid10()` --calls--> `buildCid10SearchText()`  [EXTRACTED]
  prisma/seed-cid10.ts → src/lib/cid-types.ts
- `seedCid11()` --calls--> `buildCid11SearchText()`  [EXTRACTED]
  prisma/seed-cid11.ts → src/lib/cid-types.ts

## Import Cycles
- None detected.

## Communities (106 total, 18 thin omitted)

### Community 0 - "prescription.service.ts"
Cohesion: 0.08
Nodes (52): buildFooterDoctorLine(), buildHeaderDoctorLines(), buildMedicationHeadline(), buildMedicationSubtitle(), buildPrescriptionFilename(), buildPrescriptionHtml(), buildSignatureBlock(), buildValidateDisplayUrl() (+44 more)

### Community 1 - "whatsapp-ai.service.ts"
Cohesion: 0.09
Nodes (45): CLINIC_TIMEZONE, CLINIC_TIMEZONE_LABEL, clinicAddDaysIso(), clinicDateParts(), clinicDayPeriod, clinicDayPeriodLabel(), clinicGreeting(), clinicNowClock() (+37 more)

### Community 2 - "whatsapp-booking-orchestrator.ts"
Cohesion: 0.12
Nodes (48): BookingState, botAskedPeriodChoice(), botOfferedAfternoonStart(), botOfferedTomorrow(), extractTimeFromAnyText(), filterSlotsByPeriod(), HANDOFF_TIMEOUT_MS, hasCompleteBookingDraft() (+40 more)

### Community 3 - "avatar.service.ts"
Cohesion: 0.12
Nodes (39): createS3Client(), isStorageUploadConfigured(), publicUrlForKey(), storageConfig(), uploadObject(), ALLOWED_MIME, authHeaders(), avatarFileName() (+31 more)

### Community 4 - "prisma.ts"
Cohesion: 0.07
Nodes (5): prisma, getPlatformSettings(), updatePlatformSettings(), runSubscriptionLifecycle(), include

### Community 5 - "appointments.controller.ts"
Cohesion: 0.13
Nodes (30): aiDraft(), charge(), create(), ctxFromReq(), getById(), list(), nextSlot(), receipt() (+22 more)

### Community 6 - "whatsapp-ai-tools.service.ts"
Cohesion: 0.13
Nodes (32): normalizeTimeHHmm(), canExecuteToolInMode(), isToolAllowed(), doctorNameMatchesQuery(), formatDoctorForPatientListing(), isDoctorVisibleToPatients(), extractPhoneDigitsFromText(), formatPhoneBrDisplay() (+24 more)

### Community 7 - "bulas.service.ts"
Cohesion: 0.14
Nodes (35): splitClasses(), buildDetailFromConsultaRemedios(), buildPayload(), BulapiSubstanceCandidate, BulaSource, dedupeAnvisaItems(), dedupeBulapiSearch(), fetchAndBuildDetail() (+27 more)

### Community 8 - "saas-billing-seed.ts"
Cohesion: 0.11
Nodes (31): allFeaturesEnabled(), FEATURE_PERMISSION_HINTS, isPlanFeature(), LEGACY_PLAN_SLUG, parsePlanFeatures(), parsePlanLimits(), PLAN_FEATURE_LABELS, PLAN_FEATURES (+23 more)

### Community 9 - "import-cid.ts"
Cohesion: 0.10
Nodes (22): SAMPLE, seedCid10(), SAMPLE, seedCid11(), buildCid10SearchText(), buildCid11SearchText(), Cid10Record, Cid11Record (+14 more)

### Community 10 - "bula-sections.ts"
Cohesion: 0.12
Nodes (30): BULA_SECTION_LABELS, cleanText(), countFilledSections(), dedupeParagraphs(), matchSectionKey(), normalizeHeading(), parseBulaText(), ParsedBulaSections (+22 more)

### Community 11 - "clinmax-pay.service.ts"
Cohesion: 0.17
Nodes (28): fromCents(), moneyFromUnknown(), roundMoney(), toCents(), detectPixKeyType(), isCpfChecksum(), maskPixKey(), normalizePixKey() (+20 more)

### Community 12 - "saas-billing.controller.ts"
Cohesion: 0.20
Nodes (28): cancelSubscription(), changeClinicPlan(), changeSubscriptionPlan(), createPlan(), createSubscriptionInvoice(), duplicatePlan(), extendTrial(), getClinicDetail() (+20 more)

### Community 13 - "whatsapp.controller.ts"
Cohesion: 0.25
Nodes (27): createChat(), createConnection(), createTemplate(), ctxFromReq(), deleteTemplate(), disconnect(), getChatAvatar(), getSettings() (+19 more)

### Community 14 - "env.ts"
Cohesion: 0.10
Nodes (24): DEFAULT_PRODUCTION_ORIGINS, parseCsvOrigins(), resolveCorsOrigins(), ASAAS_API_KEY, ASAAS_BASE_URL, ASAAS_CUSTOMER_ID, ASAAS_PIX_KEY, ASAAS_WEBHOOK_EMAIL (+16 more)

### Community 15 - "whatsapp-reminder.service.ts"
Cohesion: 0.14
Nodes (21): enqueueOutbox(), processOutboxItem(), processPendingOutbox(), resolveDefaultConnectionId(), findPatientWhatsappChat(), getPatientWhatsappDigits(), patientChatSelect, PatientOutboundTarget (+13 more)

### Community 16 - "exames.service.ts"
Cohesion: 0.11
Nodes (22): getExameByCode(), searchExames(), autocompleteTuss(), getTussByCode(), listTuss(), normalizeListResponse(), searchTuss(), TUSS_TIMEOUT_MS (+14 more)

### Community 17 - "finance.service.ts"
Cohesion: 0.14
Nodes (21): assertClinicEntity(), createTransaction(), decimalToNumber(), ensureDefaultFinanceSetup(), financialAnalysis(), getCashFlow(), getFinanceSettings(), getSummary() (+13 more)

### Community 18 - "patients.controller.ts"
Cohesion: 0.14
Nodes (21): archive(), create(), ctxFromReq(), getById(), getHistory(), list(), lookup(), sendMatchConflict() (+13 more)

### Community 19 - "message-store.ts"
Cohesion: 0.17
Nodes (23): createChat(), sendDocumentNow(), sendDocumentMessage(), sendTextMessage(), waitSocketOpen(), dedupeByWaMessageId(), ensureChat(), extractText() (+15 more)

### Community 20 - "invite-email-assets.ts"
Cohesion: 0.16
Nodes (22): main(), sample, assetPath(), ASSETS_DIR, CID, cidRef(), getInviteEmailAttachments(), getInviteEmailInlineImages() (+14 more)

### Community 21 - "auth.controller.ts"
Cohesion: 0.13
Nodes (21): completeOnboarding(), GOOGLE_ERROR_MESSAGES, googleAuthCallback(), googleAuthStart(), login(), me(), meAvatar(), register() (+13 more)

### Community 22 - "types/index.ts"
Cohesion: 0.15
Nodes (15): ctxFromReq(), getBula(), getCid10Code(), listCid10Chapters(), listContacts(), listLogs(), searchBulas(), searchCid10() (+7 more)

### Community 23 - "appointment.service.ts"
Cohesion: 0.16
Nodes (23): appointmentInclude, buildRecurrenceDates(), computeTotal(), parseDateOnly(), ProcedureInput, canViewAppointmentPatient(), appointmentTimeline(), AppointmentTimelineFields (+15 more)

### Community 24 - "invite.service.ts"
Cohesion: 0.14
Nodes (21): generateInviteToken(), normalizeInviteCode(), acceptInviteToken(), approveJoinRequest(), buildAuthSession(), createEmailInvite(), ensureClinicInviteCode(), generateToken() (+13 more)

### Community 25 - "clinic-roles.ts"
Cohesion: 0.16
Nodes (18): seedCidInss(), main(), prisma, ALL_CONFIGURABLE_PERMISSIONS, assignDefaultRoleToUserClinic(), ClinicRoleDto, ensureDefaultClinicRoles(), parsePermissionsJson() (+10 more)

### Community 26 - "plan-entitlements.ts"
Cohesion: 0.15
Nodes (19): checkClinicLimit(), ClinicEntitlements, clinicHasFeature(), countDoctors(), countUsers(), countWhatsappConnections(), getClinicEntitlements(), getClinicLimits() (+11 more)

### Community 27 - "whatsapp.service.ts"
Cohesion: 0.21
Nodes (23): assertClinicFeature(), assertClinicLimit(), assertConnectionAccess(), createConnection(), disconnect(), ensureConnectionRuntime(), getConnectionStatus(), isResumableStatus() (+15 more)

### Community 28 - "manager.ts"
Cohesion: 0.14
Nodes (20): setContactComposing(), bindConnectionHandlers(), bindMessageHandlers(), ConnectionRuntimeUpdate, createSocket(), getStatusCode(), openWhatsAppSession(), patchConnection() (+12 more)

### Community 29 - "ctxFromRequest"
Cohesion: 0.19
Nodes (19): panelMetrics(), recentPatients(), stats(), todayPatients(), upcomingAppointments(), addItem(), auditFromReq(), create() (+11 more)

### Community 30 - "finance.routes.ts"
Cohesion: 0.17
Nodes (21): analysis(), cashFlow(), createAccount(), createCategory(), createCostCenter(), createPaymentMethod(), createTransaction(), financeSettingsGet() (+13 more)

### Community 31 - "invite.routes.ts"
Cohesion: 0.25
Nodes (21): acceptInvite(), acceptInviteSchema, approveClinicJoinRequest(), approveJoinSchema, clinicRoleEnum, createClinicInvite(), createInviteSchema, handleError() (+13 more)

### Community 32 - "auth.service.ts"
Cohesion: 0.21
Nodes (20): resolveUserPermissions(), JWT_EXPIRES, getPermissionsForRole(), getRedirectPath(), AuthUserRow, buildAuthSession(), completeOnboarding(), generateToken() (+12 more)

### Community 33 - "compilerOptions"
Cohesion: 0.09
Nodes (21): dist, node_modules, src, compilerOptions, baseUrl, declaration, declarationMap, esModuleInterop (+13 more)

### Community 34 - "vacinas.service.ts"
Cohesion: 0.13
Nodes (16): searchVacinas(), RXTERMS_TIMEOUT_MS, rxtermsFetch(), RxTermsRawResponse, searchRxTerms(), CacheEntry, FALLBACK_VACCINES, fetchFromApi() (+8 more)

### Community 35 - "whatsapp-messaging.service.ts"
Cohesion: 0.16
Nodes (19): AI_PERMISSION_KEYS, AiMode, aiModeFromLegacy(), AiPermissionKey, AiPermissions, buildAiToolsDoc(), DEFAULT_AI_PERMISSIONS, legacyFlagsFromAiMode() (+11 more)

### Community 36 - "backoffice.service.ts"
Cohesion: 0.14
Nodes (15): adminLogin(), assertPlatformOwner(), buildMonthlyTrend(), countCreatedInRange(), createClinic(), createPlatformUser(), defaultClinicIdForUser(), formatRelativeTime() (+7 more)

### Community 37 - "medicamentos.service.ts"
Cohesion: 0.16
Nodes (19): formatRegulatoryCategory(), REGULATORY_LABELS, buildFallback(), CacheEntry, countProductsBySubstance(), enrichProductsWithPrices(), getMedicamentoProduto(), mapBulapiSearch() (+11 more)

### Community 38 - "dependencies"
Cohesion: 0.10
Nodes (21): bcryptjs, date-fns, dotenv, fastify, @fastify/jwt, @fastify/multipart, jsonwebtoken, dependencies (+13 more)

### Community 39 - "encounter.service.ts"
Cohesion: 0.21
Nodes (19): ALLOWED, assertAppointmentStatusTransition(), CLINICAL_STATUSES, clinicalStatusRequiresRecordsWrite(), isClinicalStatusTransition(), addAddendum(), assertCanWriteRecords(), audit() (+11 more)

### Community 40 - "sendMessageNow"
Cohesion: 0.18
Nodes (18): fetchProfilePictureBuffer(), getChatAvatarBuffer(), isProfileStale(), refreshChatProfile(), scheduleChatsProfileSync(), assertConnectionForClinic(), findUsableConnection(), sendFromContext() (+10 more)

### Community 41 - "openrouter.ts"
Cohesion: 0.16
Nodes (16): history, messages, stored, messages, chatCompletion(), chatCompletionWithFallback(), extractTextFromReasoningDetails(), getApiKey() (+8 more)

### Community 42 - "duplicate-validation.ts"
Cohesion: 0.22
Nodes (17): checkCpf(), checkEmail(), checkUserName(), DuplicateField, DuplicateFieldErrors, DuplicateFieldsError, findPatientMatch(), normalizeCpf() (+9 more)

### Community 43 - "appointmentDoctorFilter"
Cohesion: 0.21
Nodes (15): appointmentDoctorFilter(), clinicWhere(), dayStatusCounts(), getPanelMetrics(), getStats(), getTodayPatients(), getUpcomingAppointments(), pctChange() (+7 more)

### Community 44 - "backoffice.routes.ts"
Cohesion: 0.27
Nodes (15): createClinic(), createUser(), getUser(), listClinics(), listPatients(), listUsers(), login(), me() (+7 more)

### Community 45 - "agenda-schedule.ts"
Cohesion: 0.23
Nodes (17): addMinutesToTime(), AgendaRow, AgendaSchedule, buildAgendaRows(), DEFAULT_AGENDA_SCHEDULE, generateAgendaSlots(), isWithinWorkHours(), minutesToTime() (+9 more)

### Community 46 - "devDependencies"
Cohesion: 0.12
Nodes (17): devDependencies, prisma, tsx, @types/bcryptjs, @types/jsonwebtoken, @types/node, @types/nodemailer, @types/qrcode (+9 more)

### Community 47 - "subscription-billing.service.ts"
Cohesion: 0.24
Nodes (16): isAsaasConfigured(), AsaasPaymentPayload, cancelAsaasSubscription(), createManualInvoice(), ensureClinicAsaasCustomer(), ensureInvoiceForAsaasPayment(), handleSubscriptionPaymentConfirmed(), handleSubscriptionPaymentReceived() (+8 more)

### Community 48 - "cid.controller.ts"
Cohesion: 0.25
Nodes (12): ctxFromReq(), getCid10ByCodigo(), getCid10Capitulos(), getCid10Grupos(), getCid11Blocos(), getCid11ByCodigo(), getCid11Capitulos(), getCidInss() (+4 more)

### Community 49 - "writeAuditLog"
Cohesion: 0.28
Nodes (15): writeAuditLog(), computeTrialEnd(), cancelSubscription(), changePlan(), extendTrial(), getClinicDetail(), getSubscriptionByClinicId(), getSubscriptionById() (+7 more)

### Community 50 - "bulapi.client.ts"
Cohesion: 0.12
Nodes (6): BULAPI_TIMEOUT_MS, BulapiMeta, BulapiPresentation, BulapiPriceEntry, BulapiProduct, BulapiSearchResponse

### Community 51 - "scripts"
Cohesion: 0.13
Nodes (15): scripts, build, db:migrate, db:push, db:seed, db:setup, db:studio, dev (+7 more)

### Community 52 - "medicine-aliases.ts"
Cohesion: 0.24
Nodes (12): queries, expandMedicineQueryTerms(), findMedicineAliasByKey(), GENERIC_SALT_TOKENS, isGenericSaltToken(), matchMedicineAliases(), MEDICINE_ALIASES, MedicineAliasEntry (+4 more)

### Community 53 - "whatsapp-satisfaction-orchestrator.ts"
Cohesion: 0.33
Nodes (13): systemAuthContext(), mergeAiContext(), createSurveyForAppointment(), looksLikeThanks(), markSurveySent(), parseSatisfactionRating(), saveSurveyRating(), attachSurveyToConfirmedBooking() (+5 more)

### Community 54 - "asaas.client.ts"
Cohesion: 0.23
Nodes (13): AsaasApiError, AsaasErrorBody, asaasFetch(), cancelTransfer(), createCustomer(), createPixPayment(), createPixTransfer(), createSubscription() (+5 more)

### Community 55 - "mail.service.ts"
Cohesion: 0.26
Nodes (12): main(), isMailConfigured(), MAIL_SMTP_HOST, MAIL_SMTP_PASS, MAIL_SMTP_PORT, createTransport(), inviteEmailLayout(), MailSendResult (+4 more)

### Community 56 - "anvisa.client.ts"
Cohesion: 0.20
Nodes (9): ANVISA_TIMEOUT_MS, AnvisaBulaItem, anvisaBulaPdfUrl(), anvisaBulaUrl(), anvisaFetch(), anvisaHeaders(), AnvisaListResponse, fetchAnvisaBulaRaw() (+1 more)

### Community 57 - "pharmadb.client.ts"
Cohesion: 0.22
Nodes (10): fetchPharmadbBula(), fetchPharmadbBulaById(), getToken(), normalizeTerm(), PHARMADB_TIMEOUT_MS, PharmadbBulaDetail, PharmadbBulaSummary, PharmadbToken (+2 more)

### Community 58 - "src/index.ts"
Cohesion: 0.21
Nodes (9): app, createSchema, finalizeSchema, itemSchema, prescriptionsRoutes(), publicPrescriptionRoutes(), resendWhatsappSchema, updateSchema (+1 more)

### Community 59 - "bula-types.ts"
Cohesion: 0.23
Nodes (8): BulaDetailPayload, BulaFetchError, BulaPosologia, BulaSummary, PaginatedBulasResponse, getBulaFromCache(), isCacheFresh(), searchBulaCacheByQuery()

### Community 60 - "test-bucket-connection-http.ts"
Cohesion: 0.33
Nodes (10): authHeaders(), cfg(), extractDownloadUrl(), extractFileId(), extractUploadHeaders(), extractUploadMethod(), extractUploadUrl(), JsonRecord (+2 more)

### Community 61 - "buildAuthContext"
Cohesion: 0.33
Nodes (7): create(), getById(), list(), remove(), update(), buildAuthContext(), doctorSchema

### Community 62 - "records.controller.ts"
Cohesion: 0.42
Nodes (7): create(), ctxFromReq(), getById(), list(), remove(), update(), recordSchema

### Community 63 - "user.service.ts"
Cohesion: 0.31
Nodes (7): validatePassword(), CreateDoctorInput, CreateReceptionInput, createUser(), getById(), setLinkedDoctors(), updateUser()

### Community 64 - "patient.service.ts"
Cohesion: 0.36
Nodes (9): archive(), CLINICAL_FIELDS, create(), getById(), list(), lookupMatch(), mapPatientData(), stripClinicalFields() (+1 more)

### Community 65 - "doctor.service.ts"
Cohesion: 0.31
Nodes (3): assertDoctorInClinic(), doctorInClinicWhere(), list()

### Community 66 - "auth-db.ts"
Cohesion: 0.36
Nodes (8): ensureDbAuthState(), loadStored(), lockFor(), locks, parseAuthData(), saveStored(), StoredAuth, useDbAuthState()

### Community 67 - "clinic-role.controller.ts"
Cohesion: 0.61
Nodes (6): createRole(), getRole(), listRoles(), removeRole(), updateRole(), clinicRoleRoutes()

### Community 68 - "clinmax-pay.controller.ts"
Cohesion: 0.46
Nodes (6): appointmentPayGet(), asaasWebhook(), mapPayError(), payEnabledPatch(), paySettingsGet(), paySettingsPut()

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

### Community 73 - "agenda-notes.controller.ts"
Cohesion: 0.67
Nodes (5): create(), ctxFromReq(), list(), remove(), update()

### Community 74 - "clinics.routes.ts"
Cohesion: 0.52
Nodes (5): create(), getById(), list(), remove(), update()

### Community 75 - "inventory.controller.ts"
Cohesion: 0.67
Nodes (5): createProduct(), listMovements(), listProducts(), mapError(), moveStock()

### Community 76 - "reports.controller.ts"
Cohesion: 0.52
Nodes (5): attendance(), birthdays(), cid(), noShows(), repasse()

### Community 77 - "satisfaction.controller.ts"
Cohesion: 0.52
Nodes (5): create(), list(), markSent(), submitAnswer(), summary()

### Community 78 - "waiting-list.controller.ts"
Cohesion: 0.67
Nodes (5): create(), ctxFromReq(), list(), remove(), update()

### Community 80 - "JwtPayload"
Cohesion: 0.38
Nodes (6): fastify, @fastify/jwt, FastifyInstance, FastifyJWT, FastifyRequest, JwtPayload

### Community 81 - "record.service.ts"
Cohesion: 0.47
Nodes (4): getById(), list(), remove(), update()

### Community 82 - "package.json"
Cohesion: 0.40
Nodes (4): name, private, type, version

### Community 83 - "build-email-hero.ts"
Cohesion: 0.40
Nodes (3): OUT, ROOT, SRC

### Community 84 - "build-email-icons.ts"
Cohesion: 0.40
Nodes (3): ICON_BG, ICONS, OUT_DIR

### Community 85 - "tiss.controller.ts"
Cohesion: 0.70
Nodes (3): createGuide(), listGuides(), updateStatus()

### Community 87 - "test-s3.ts"
Cohesion: 0.67
Nodes (3): main(), tryVariant(), variants

## Knowledge Gaps
- **267 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+262 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `prisma` connect `prisma.ts` to `prescription.service.ts`, `whatsapp-ai.service.ts`, `whatsapp-booking-orchestrator.ts`, `avatar.service.ts`, `whatsapp-ai-tools.service.ts`, `saas-billing-seed.ts`, `import-cid.ts`, `clinmax-pay.service.ts`, `whatsapp-reminder.service.ts`, `finance.service.ts`, `patients.controller.ts`, `message-store.ts`, `types/index.ts`, `appointment.service.ts`, `invite.service.ts`, `clinic-roles.ts`, `plan-entitlements.ts`, `whatsapp.service.ts`, `manager.ts`, `auth.service.ts`, `whatsapp-messaging.service.ts`, `backoffice.service.ts`, `encounter.service.ts`, `sendMessageNow`, `openrouter.ts`, `duplicate-validation.ts`, `appointmentDoctorFilter`, `subscription-billing.service.ts`, `writeAuditLog`, `whatsapp-satisfaction-orchestrator.ts`, `bula-types.ts`, `user.service.ts`, `patient.service.ts`, `doctor.service.ts`, `auth-db.ts`, `agenda-note.service.ts`, `waiting-list.service.ts`, `satisfaction.service.ts`, `record.service.ts`?**
  _High betweenness centrality (0.167) - this node is a cross-community bridge._
- **Why does `writeAuditLog()` connect `writeAuditLog` to `prisma.ts`, `whatsapp-ai-tools.service.ts`, `encounter.service.ts`, `saas-billing-seed.ts`, `clinmax-pay.service.ts`, `cid.controller.ts`, `types/index.ts`, `ctxFromRequest`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `buildAuthContext()` connect `buildAuthContext` to `auth.service.ts`, `appointments.controller.ts`, `agenda-notes.controller.ts`, `whatsapp.controller.ts`, `waiting-list.controller.ts`, `cid.controller.ts`, `patients.controller.ts`, `types/index.ts`, `src/index.ts`, `ctxFromRequest`, `records.controller.ts`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `executeAiTool()` (e.g. with `formatDoctorForPatientListing()` and `isDoctorVisibleToPatients()`) actually correct?**
  _`executeAiTool()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _267 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `prescription.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07627118644067797 - nodes in this community are weakly interconnected._
- **Should `whatsapp-ai.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08549019607843138 - nodes in this community are weakly interconnected._