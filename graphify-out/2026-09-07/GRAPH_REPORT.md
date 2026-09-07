# Graph Report - back-projeto-clinica  (2026-08-31)

## Corpus Check
- 260 files · ~331,220 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2065 nodes · 5135 edges · 110 communities (93 shown, 17 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 93 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `711e950c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- prescription.service.ts
- whatsapp-ai.service.ts
- whatsapp-booking-orchestrator.ts
- avatar.service.ts
- prisma.ts
- audit-log.ts
- state-machines.test.ts
- bulas.service.ts
- plan.service.ts
- import-cid.ts
- consultaremedios.client.ts
- clinmax-pay.service.ts
- saas-billing.controller.ts
- whatsapp.controller.ts
- mail.service.ts
- whatsapp-reminder.service.ts
- exames.service.ts
- finance.service.ts
- invite.service.ts
- message-store.ts
- invite-email-template.ts
- auth.controller.ts
- backoffice.service.ts
- doctor.service.ts
- plan-catalog.ts
- auth-context.ts
- Operação do PM2 na VPS
- whatsapp.service.ts
- manager.ts
- whatsapp-ai-tools.service.ts
- ctxFromRequest
- invite.routes.ts
- prod-migrate.cjs
- compilerOptions
- vacinas.service.ts
- whatsapp-messaging.service.ts
- subscription-lifecycle.service.ts
- medicamentos.service.ts
- dependencies
- encounter.service.ts
- sendMessageNow
- plan-entitlements.ts
- invite-email-assets.ts
- appointmentDoctorFilter
- patients.controller.ts
- appointment.service.ts
- devDependencies
- subscription-billing.service.ts
- cid.controller.ts
- plan-features.ts
- bulapi.client.ts
- scripts
- medicine-aliases.ts
- record.service.ts
- asaas.client.ts
- openrouter.ts
- anvisa.client.ts
- pharmadb.client.ts
- prescription-pdf.ts
- bula-sections.ts
- test-bucket-connection-http.ts
- clinic.service.ts
- subscription.service.ts
- company-legal.ts
- asaas-webhook.service.ts
- zod
- auth-db.ts
- whatsapp-satisfaction-orchestrator.ts
- signature-auth.test.ts
- users.controller.ts
- agenda-note.service.ts
- waiting-list.service.ts
- test-sepurin-search.ts
- src/index.ts
- clinics.routes.ts
- buildAuthContext
- validate-pm2-registration.test.cjs
- onlyDigits
- outros.controller.ts
- types/index.ts
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
- saas-billing-seed.ts
- roundMoney
- medicamentos.controller.ts
- bcryptjs

## God Nodes (most connected - your core abstractions)
1. `ctxFromRequest()` - 76 edges
2. `prisma` - 65 edges
3. `moneyFromUnknown()` - 38 edges
4. `executeAiTool()` - 38 edges
5. `writeAuditLog()` - 37 edges
6. `tryDeterministicBooking()` - 33 edges
7. `AuthContext` - 30 edges
8. `appointmentDoctorFilter()` - 26 edges
9. `generateAiReply()` - 26 edges
10. `buildAuthContext()` - 25 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `generateInviteCode()`  [EXTRACTED]
  prisma/seed.ts → src/lib/invite-code.ts
- `main()` --calls--> `ensurePlatformPlansAndSettings()`  [EXTRACTED]
  prisma/seed.ts → src/lib/saas-billing-seed.ts
- `main()` --calls--> `migrateExistingClinicsToLegacy()`  [EXTRACTED]
  prisma/seed.ts → src/lib/saas-billing-seed.ts
- `main()` --calls--> `isMailConfigured()`  [EXTRACTED]
  scripts/test-invite-mail.ts → src/lib/env.ts
- `main()` --calls--> `getInviteEmailInlineImages()`  [EXTRACTED]
  scripts/test-invite-mail.ts → src/lib/invite-email-assets.ts

## Import Cycles
- None detected.

## Communities (110 total, 17 thin omitted)

### Community 0 - "prescription.service.ts"
Cohesion: 0.10
Nodes (35): assertPrescriptionEditable(), enqueueOutbox(), nextBackoffMs(), buildPrescriptionFilename(), getBrowser(), htmlToPdfBuffer(), addItem(), assertAppointmentInClinic() (+27 more)

### Community 1 - "whatsapp-ai.service.ts"
Cohesion: 0.09
Nodes (45): buildAiToolsDoc(), CLINIC_TIMEZONE, CLINIC_TIMEZONE_LABEL, clinicAddDaysIso(), clinicDateParts(), clinicDayPeriod, clinicDayPeriodLabel(), clinicGreeting() (+37 more)

### Community 2 - "whatsapp-booking-orchestrator.ts"
Cohesion: 0.12
Nodes (48): BookingState, botAskedPeriodChoice(), botOfferedAfternoonStart(), botOfferedTomorrow(), extractTimeFromAnyText(), filterSlotsByPeriod(), HANDOFF_TIMEOUT_MS, hasCompleteBookingDraft() (+40 more)

### Community 3 - "avatar.service.ts"
Cohesion: 0.12
Nodes (39): createS3Client(), isStorageUploadConfigured(), publicUrlForKey(), storageConfig(), uploadObject(), ALLOWED_MIME, authHeaders(), avatarFileName() (+31 more)

### Community 4 - "prisma.ts"
Cohesion: 0.17
Nodes (3): prisma, getPlatformSettings(), updatePlatformSettings()

### Community 5 - "audit-log.ts"
Cohesion: 0.09
Nodes (39): aiDraft(), charge(), create(), ctxFromReq(), getById(), list(), nextSlot(), receipt() (+31 more)

### Community 6 - "state-machines.test.ts"
Cohesion: 0.08
Nodes (27): APPOINTMENT_TRANSITIONS, CLINICAL_STATUSES, clinicalStatusRequiresRecordsWrite(), isClinicalStatusTransition(), assertEncounterCanAddendum(), assertEncounterCanEdit(), ENCOUNTER_STATUSES, ENCOUNTER_TERMINAL (+19 more)

### Community 7 - "bulas.service.ts"
Cohesion: 0.14
Nodes (35): splitClasses(), buildDetailFromConsultaRemedios(), buildPayload(), BulapiSubstanceCandidate, BulaSource, dedupeAnvisaItems(), dedupeBulapiSearch(), fetchAndBuildDetail() (+27 more)

### Community 8 - "plan.service.ts"
Cohesion: 0.25
Nodes (17): annualEquivalentMonthly(), formatComparisonValue(), getCommercialPlan(), parsePlanFeatures(), parsePlanLimits(), serializePlanFeatures(), serializePlanLimits(), createPlan() (+9 more)

### Community 9 - "import-cid.ts"
Cohesion: 0.10
Nodes (22): SAMPLE, seedCid10(), SAMPLE, seedCid11(), buildCid10SearchText(), buildCid11SearchText(), Cid10Record, Cid11Record (+14 more)

### Community 10 - "consultaremedios.client.ts"
Cohesion: 0.22
Nodes (17): dedupeParagraphs(), splitDizeresLegais(), CR_TIMEOUT_MS, extractClasses(), extractLaboratorio(), extractLeafletSections(), extractRegistroMs(), fetchConsultaRemediosBula() (+9 more)

### Community 11 - "clinmax-pay.service.ts"
Cohesion: 0.20
Nodes (20): moneyFromUnknown(), charge(), chargeAppointment(), dispatchTransfer(), ensureAsaasCustomer(), ensurePayoutDispatched(), getAppointmentPay(), handleAsaasWebhook() (+12 more)

### Community 12 - "saas-billing.controller.ts"
Cohesion: 0.19
Nodes (29): cancelClinicUpgrade(), cancelSubscription(), changeClinicPlan(), changeSubscriptionPlan(), createPlan(), createSubscriptionInvoice(), duplicatePlan(), extendTrial() (+21 more)

### Community 13 - "whatsapp.controller.ts"
Cohesion: 0.18
Nodes (32): createChat(), createConnection(), createTemplate(), ctxFromReq(), deleteTemplate(), disconnect(), getChatAvatar(), getSettings() (+24 more)

### Community 14 - "mail.service.ts"
Cohesion: 0.23
Nodes (14): main(), isMailConfigured(), MAIL_SMTP_HOST, MAIL_SMTP_PASS, MAIL_SMTP_PORT, rejectJoinRequest(), clinicReplyTo(), createTransport() (+6 more)

### Community 15 - "whatsapp-reminder.service.ts"
Cohesion: 0.16
Nodes (18): finalize(), processClinicalOutbox(), enqueueOutbox(), processOutboxItem(), processPendingOutbox(), resolveDefaultConnectionId(), reminderAppointmentInclude, runAutomaticReminders() (+10 more)

### Community 16 - "exames.service.ts"
Cohesion: 0.11
Nodes (22): getExameByCode(), searchExames(), autocompleteTuss(), getTussByCode(), listTuss(), normalizeListResponse(), searchTuss(), TUSS_TIMEOUT_MS (+14 more)

### Community 17 - "finance.service.ts"
Cohesion: 0.11
Nodes (28): applyPaidToAccountBalance(), LedgerTx, LedgerTxStatus, LedgerTxType, summarizeLedgerPeriod(), assertClinicEntity(), createTransaction(), decimalToNumber() (+20 more)

### Community 18 - "invite.service.ts"
Cohesion: 0.05
Nodes (76): checkCpf(), checkEmail(), checkUserName(), DuplicateField, DuplicateFieldErrors, DuplicateFieldsError, findPatientMatch(), normalizeCpf() (+68 more)

### Community 19 - "message-store.ts"
Cohesion: 0.18
Nodes (21): createChat(), sendDocumentNow(), sendDocumentMessage(), dedupeByWaMessageId(), ensureChat(), extractText(), findExistingChatByPhone(), findPatientByPhone() (+13 more)

### Community 20 - "invite-email-template.ts"
Cohesion: 0.31
Nodes (12): main(), sample, buildClinicInviteEmailHtml(), buildClinicInviteEmailText(), ClinicInviteEmailContent, COLORS, esc(), formatInviteCodeSpaced() (+4 more)

### Community 21 - "auth.controller.ts"
Cohesion: 0.13
Nodes (21): completeOnboarding(), GOOGLE_ERROR_MESSAGES, googleAuthCallback(), googleAuthStart(), login(), me(), meAvatar(), register() (+13 more)

### Community 22 - "backoffice.service.ts"
Cohesion: 0.10
Nodes (28): createClinic(), createUser(), getUser(), listClinics(), listPatients(), listUsers(), login(), me() (+20 more)

### Community 23 - "doctor.service.ts"
Cohesion: 0.31
Nodes (3): assertDoctorInClinic(), doctorInClinicWhere(), list()

### Community 24 - "plan-catalog.ts"
Cohesion: 0.13
Nodes (20): COMMERCIAL_PLAN_SLUGS, COMMERCIAL_PLANS, CommercialPlanDef, commercialPlanRank(), CommercialPlanSlug, COMPARISON_ROWS, ComparisonKind, ComparisonRowDef (+12 more)

### Community 25 - "auth-context.ts"
Cohesion: 0.13
Nodes (26): seedCidInss(), main(), prisma, jwtFromRequest(), RequestWithUser, ALL_CONFIGURABLE_PERMISSIONS, assignDefaultRoleToUserClinic(), ClinicRoleDto (+18 more)

### Community 26 - "Operação do PM2 na VPS"
Cohesion: 0.10
Nodes (20): 1. Selecionar o Node permanente, 2. Instalar e chamar o PM2 pelo mesmo Node, 3. Fazer backup do estado atual, 4. Corrigir o registro da clinmax-api, se necessário, 5. Regenerar o serviço systemd, 6. Validar a unit e os processos, 7. Testar um reboot planejado, Atualização futura do Node (+12 more)

### Community 27 - "whatsapp.service.ts"
Cohesion: 0.21
Nodes (20): assertConnectionAccess(), createConnection(), disconnect(), ensureConnectionRuntime(), getConnectionStatus(), isResumableStatus(), listConnections(), logout() (+12 more)

### Community 28 - "manager.ts"
Cohesion: 0.13
Nodes (24): clearDbAuthState(), composingUntilByJid, setContactComposing(), bindConnectionHandlers(), bindMessageHandlers(), createSocket(), getStatusCode(), logoutRuntime() (+16 more)

### Community 29 - "whatsapp-ai-tools.service.ts"
Cohesion: 0.13
Nodes (32): canExecuteToolInMode(), isToolAllowed(), doctorNameMatchesQuery(), formatDoctorForPatientListing(), isDoctorVisibleToPatients(), extractPhoneDigitsFromText(), formatPhoneBrDisplay(), fromParts() (+24 more)

### Community 30 - "ctxFromRequest"
Cohesion: 0.06
Nodes (73): createRole(), getRole(), listRoles(), removeRole(), resetRole(), updateRole(), appointmentPayGet(), asaasWebhook() (+65 more)

### Community 31 - "invite.routes.ts"
Cohesion: 0.25
Nodes (21): acceptInvite(), acceptInviteSchema, approveClinicJoinRequest(), approveJoinSchema, clinicRoleEnum, createClinicInvite(), createInviteSchema, handleError() (+13 more)

### Community 32 - "prod-migrate.cjs"
Cohesion: 0.24
Nodes (19): assertPostgresUrl(), baselineIfNeeded(), columnExists(), dockerPsql(), enumExists(), fail(), main(), migrationApplied() (+11 more)

### Community 33 - "compilerOptions"
Cohesion: 0.06
Nodes (32): dist, js, json, mjs, node_modules, src, **/*.test.ts, compilerOptions (+24 more)

### Community 34 - "vacinas.service.ts"
Cohesion: 0.13
Nodes (16): searchVacinas(), RXTERMS_TIMEOUT_MS, rxtermsFetch(), RxTermsRawResponse, searchRxTerms(), CacheEntry, FALLBACK_VACCINES, fetchFromApi() (+8 more)

### Community 35 - "whatsapp-messaging.service.ts"
Cohesion: 0.19
Nodes (17): AI_PERMISSION_KEYS, AiMode, aiModeFromLegacy(), AiPermissionKey, AiPermissions, DEFAULT_AI_PERMISSIONS, legacyFlagsFromAiMode(), parseAiPermissions() (+9 more)

### Community 36 - "subscription-lifecycle.service.ts"
Cohesion: 0.26
Nodes (13): canRepairPastDueGhost(), shouldExpireTrial(), shouldIssueLocalRenewal(), shouldMarkPastDue(), shouldSuspendPastDue(), subscriptionGrantsAccessNow(), SubscriptionLifecycleStatus, now (+5 more)

### Community 37 - "medicamentos.service.ts"
Cohesion: 0.16
Nodes (19): formatRegulatoryCategory(), REGULATORY_LABELS, buildFallback(), CacheEntry, countProductsBySubstance(), enrichProductsWithPrices(), getMedicamentoProduto(), mapBulapiSearch() (+11 more)

### Community 38 - "dependencies"
Cohesion: 0.09
Nodes (23): date-fns, dotenv, fastify, @fastify/jwt, @fastify/multipart, @hapi/boom, jsonwebtoken, dependencies (+15 more)

### Community 39 - "encounter.service.ts"
Cohesion: 0.16
Nodes (23): assertCanWriteRecords(), assertHasPermission(), assertOptimisticLock(), assertOwnsClinicalResource(), assertAppointmentStatusTransition(), assertEncounterTransition(), writeAuditLogInTx(), addAddendum() (+15 more)

### Community 40 - "sendMessageNow"
Cohesion: 0.18
Nodes (18): assertConnectionForClinic(), findUsableConnection(), sendFromContext(), sendMessageNow(), setStaffComposing(), findPatientWhatsappChat(), getPatientWhatsappDigits(), patientChatSelect (+10 more)

### Community 41 - "plan-entitlements.ts"
Cohesion: 0.18
Nodes (18): assertClinicFeature(), checkClinicLimit(), ClinicEntitlements, clinicHasFeature(), countDoctors(), countUsers(), countWhatsappConnections(), getClinicEntitlements() (+10 more)

### Community 42 - "invite-email-assets.ts"
Cohesion: 0.20
Nodes (13): assetPath(), ASSETS_DIR, CID, cidRef(), getInviteEmailAttachments(), getInviteEmailInlineImages(), getJoinEmailLogoAttachment(), ICONS_DIR (+5 more)

### Community 43 - "appointmentDoctorFilter"
Cohesion: 0.19
Nodes (16): appointmentDoctorFilter(), remove(), clinicWhere(), dayStatusCounts(), getPanelMetrics(), getStats(), getTodayPatients(), getUpcomingAppointments() (+8 more)

### Community 44 - "patients.controller.ts"
Cohesion: 0.14
Nodes (21): archive(), create(), ctxFromReq(), getById(), getHistory(), list(), lookup(), sendMatchConflict() (+13 more)

### Community 45 - "appointment.service.ts"
Cohesion: 0.12
Nodes (39): addMinutesToTime(), AgendaRow, AgendaSchedule, buildAgendaRows(), DEFAULT_AGENDA_SCHEDULE, generateAgendaSlots(), isWithinWorkHours(), minutesToTime() (+31 more)

### Community 46 - "devDependencies"
Cohesion: 0.11
Nodes (19): devDependencies, prisma, tsc-alias, tsx, @types/bcryptjs, @types/jsonwebtoken, @types/node, @types/nodemailer (+11 more)

### Community 47 - "subscription-billing.service.ts"
Cohesion: 0.18
Nodes (23): isAsaasConfigured(), getPaySettings(), AsaasPaymentPayload, BillingRequirementError, cancelAsaasSubscription(), cancelPendingUpgradeInvoices(), createManualInvoice(), ensureClinicAsaasCustomer() (+15 more)

### Community 48 - "cid.controller.ts"
Cohesion: 0.25
Nodes (12): ctxFromReq(), getCid10ByCodigo(), getCid10Capitulos(), getCid10Grupos(), getCid11Blocos(), getCid11ByCodigo(), getCid11Capitulos(), getCidInss() (+4 more)

### Community 49 - "plan-features.ts"
Cohesion: 0.15
Nodes (11): PlanFeatureRequiredError, FEATURE_PERMISSION_HINTS, isPlanFeature(), LEGACY_LIMIT_ALIASES, LEGACY_PLAN_SLUG, PLAN_FEATURE_LABELS, PLAN_FEATURES, PLAN_LIMIT_KEYS (+3 more)

### Community 50 - "bulapi.client.ts"
Cohesion: 0.12
Nodes (6): BULAPI_TIMEOUT_MS, BulapiMeta, BulapiPresentation, BulapiPriceEntry, BulapiProduct, BulapiSearchResponse

### Community 51 - "scripts"
Cohesion: 0.12
Nodes (17): scripts, build, db:migrate, db:prod-migrate, db:push, db:seed, db:setup, db:studio (+9 more)

### Community 52 - "medicine-aliases.ts"
Cohesion: 0.24
Nodes (12): queries, expandMedicineQueryTerms(), findMedicineAliasByKey(), GENERIC_SALT_TOKENS, isGenericSaltToken(), matchMedicineAliases(), MEDICINE_ALIASES, MedicineAliasEntry (+4 more)

### Community 53 - "record.service.ts"
Cohesion: 0.47
Nodes (4): getById(), list(), remove(), update()

### Community 54 - "asaas.client.ts"
Cohesion: 0.10
Nodes (33): AsaasApiError, AsaasCreditCard, AsaasCreditCardHolder, AsaasErrorBody, asaasFetch(), cancelTransfer(), crc16(), createCreditCardPayment() (+25 more)

### Community 55 - "openrouter.ts"
Cohesion: 0.16
Nodes (16): history, messages, stored, messages, chatCompletion(), chatCompletionWithFallback(), extractTextFromReasoningDetails(), getApiKey() (+8 more)

### Community 56 - "anvisa.client.ts"
Cohesion: 0.20
Nodes (9): ANVISA_TIMEOUT_MS, AnvisaBulaItem, anvisaBulaPdfUrl(), anvisaBulaUrl(), anvisaFetch(), anvisaHeaders(), AnvisaListResponse, fetchAnvisaBulaRaw() (+1 more)

### Community 57 - "pharmadb.client.ts"
Cohesion: 0.22
Nodes (10): fetchPharmadbBula(), fetchPharmadbBulaById(), getToken(), normalizeTerm(), PHARMADB_TIMEOUT_MS, PharmadbBulaDetail, PharmadbBulaSummary, PharmadbToken (+2 more)

### Community 58 - "prescription-pdf.ts"
Cohesion: 0.20
Nodes (22): buildFooterDoctorLine(), buildHeaderDoctorLines(), buildMedicationHeadline(), buildMedicationSubtitle(), buildPrescriptionHtml(), buildSignatureBlock(), buildValidateDisplayUrl(), buildValidateUrl() (+14 more)

### Community 59 - "bula-sections.ts"
Cohesion: 0.11
Nodes (21): BULA_SECTION_LABELS, cleanText(), countFilledSections(), matchSectionKey(), normalizeHeading(), parseBulaText(), ParsedBulaSections, parsedToBulaSecoes() (+13 more)

### Community 60 - "test-bucket-connection-http.ts"
Cohesion: 0.33
Nodes (10): authHeaders(), cfg(), extractDownloadUrl(), extractFileId(), extractUploadHeaders(), extractUploadMethod(), extractUploadUrl(), JsonRecord (+2 more)

### Community 61 - "clinic.service.ts"
Cohesion: 0.18
Nodes (9): ALLOWED_MIME, assertClinicLogoUrl(), CLINIC_LOGO_MAX_BYTES, clinicLogoCidAttachment(), parseClinicLogoDataUrl(), ParsedClinicLogo, tinyPng, applyClinicLogoToInviteAttachments() (+1 more)

### Community 62 - "subscription.service.ts"
Cohesion: 0.27
Nodes (16): writeAuditLog(), attachPendingUpgrade(), cancelPendingUpgradeByClinic(), cancelSubscription(), changePlan(), extendTrial(), getClinicDetail(), getSubscriptionByClinicId() (+8 more)

### Community 63 - "company-legal.ts"
Cohesion: 0.38
Nodes (9): COMPANY_LEGAL, CompanyLegalAddress, CompanyLegalInfo, digitsOnly(), formatCep(), formatCnpj(), formatCompanyAddress(), formatCompanyCopyright() (+1 more)

### Community 64 - "asaas-webhook.service.ts"
Cohesion: 0.38
Nodes (7): pixQrTrackingId(), AsaasWebhookDomain, assertAsaasWebhookToken(), routeAsaasWebhookDomain(), tokensEqual(), ASAAS_WEBHOOK_TOKEN, handleAsaasWebhook()

### Community 66 - "auth-db.ts"
Cohesion: 0.36
Nodes (8): ensureDbAuthState(), loadStored(), lockFor(), locks, parseAuthData(), saveStored(), StoredAuth, useDbAuthState()

### Community 67 - "whatsapp-satisfaction-orchestrator.ts"
Cohesion: 0.31
Nodes (14): systemAuthContext(), mergeAiContext(), stringifyAiContext(), createSurveyForAppointment(), looksLikeThanks(), markSurveySent(), parseSatisfactionRating(), saveSurveyRating() (+6 more)

### Community 68 - "signature-auth.test.ts"
Cohesion: 0.13
Nodes (13): assertClinicScoped(), canonicalJson(), hashCanonical(), sha256Hex(), getSignatureProvider(), StubSignatureProvider, classifySignatureLabel(), CreateSignatureInput (+5 more)

### Community 69 - "users.controller.ts"
Cohesion: 0.53
Nodes (7): clinicId(), create(), getById(), list(), setLinkedDoctors(), update(), mapPlanErrorReply()

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
Nodes (12): app, assertDatabaseReadyOrExit(), isPrismaAuthFailure(), createSchema, finalizeSchema, itemSchema, prescriptionsRoutes(), publicPrescriptionRoutes() (+4 more)

### Community 74 - "clinics.routes.ts"
Cohesion: 0.52
Nodes (5): create(), getById(), list(), remove(), update()

### Community 75 - "buildAuthContext"
Cohesion: 0.33
Nodes (7): create(), getById(), list(), remove(), update(), buildAuthContext(), doctorSchema

### Community 76 - "validate-pm2-registration.test.cjs"
Cohesion: 0.11
Nodes (21): { resolvePermanentNvmNode }, assertPermanentNvmNode(), fs, normalizedPath(), path, resolvePermanentNvmNode(), {
  assertPermanentNvmNode,
  normalizedPath,
}, fs (+13 more)

### Community 77 - "onlyDigits"
Cohesion: 0.42
Nodes (9): detectPixKeyType(), isCpfChecksum(), maskPixKey(), normalizePixKey(), onlyDigits(), validateRecipientDocument(), presentRecipient(), setPayEnabled() (+1 more)

### Community 78 - "outros.controller.ts"
Cohesion: 0.38
Nodes (9): ctxFromReq(), getBula(), getCid10Code(), listCid10Chapters(), listContacts(), listLogs(), searchBulas(), searchCid10() (+1 more)

### Community 79 - "types/index.ts"
Cohesion: 0.11
Nodes (3): include, include, AuthContext

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

### Community 106 - "saas-billing-seed.ts"
Cohesion: 0.38
Nodes (9): computeTrialEnd(), allFeaturesEnabled(), unlimitedLimits(), ensureClinicSubscription(), ensurePlatformPlansAndSettings(), isMissingSchemaError(), migrateExistingClinicsToLegacy(), migrateUnpaidEssencialToGratis() (+1 more)

### Community 107 - "roundMoney"
Cohesion: 0.53
Nodes (6): appointmentIncomeOriginKey(), computeClinmaxPayLedger(), fromCents(), roundMoney(), toCents(), syncAppointmentIncome()

## Knowledge Gaps
- **357 isolated node(s):** `{ resolvePermanentNvmNode }`, `name`, `version`, `private`, `type` (+352 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `prisma` connect `prisma.ts` to `prescription.service.ts`, `whatsapp-ai.service.ts`, `whatsapp-booking-orchestrator.ts`, `avatar.service.ts`, `plan.service.ts`, `import-cid.ts`, `clinmax-pay.service.ts`, `whatsapp.controller.ts`, `whatsapp-reminder.service.ts`, `finance.service.ts`, `invite.service.ts`, `message-store.ts`, `backoffice.service.ts`, `doctor.service.ts`, `auth-context.ts`, `whatsapp.service.ts`, `manager.ts`, `whatsapp-ai-tools.service.ts`, `whatsapp-messaging.service.ts`, `subscription-lifecycle.service.ts`, `encounter.service.ts`, `sendMessageNow`, `plan-entitlements.ts`, `appointmentDoctorFilter`, `patients.controller.ts`, `appointment.service.ts`, `subscription-billing.service.ts`, `record.service.ts`, `openrouter.ts`, `bula-sections.ts`, `clinic.service.ts`, `subscription.service.ts`, `asaas-webhook.service.ts`, `auth-db.ts`, `whatsapp-satisfaction-orchestrator.ts`, `agenda-note.service.ts`, `waiting-list.service.ts`, `types/index.ts`, `saas-billing-seed.ts`?**
  _High betweenness centrality (0.129) - this node is a cross-community bridge._
- **Why does `ctxFromRequest()` connect `ctxFromRequest` to `auth-context.ts`, `buildAuthContext`, `whatsapp-reminder.service.ts`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `writeAuditLog()` connect `subscription.service.ts` to `prisma.ts`, `audit-log.ts`, `subscription-lifecycle.service.ts`, `encounter.service.ts`, `plan.service.ts`, `clinmax-pay.service.ts`, `onlyDigits`, `outros.controller.ts`, `cid.controller.ts`, `finance.service.ts`, `whatsapp-ai-tools.service.ts`, `ctxFromRequest`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `executeAiTool()` (e.g. with `formatDoctorForPatientListing()` and `isDoctorVisibleToPatients()`) actually correct?**
  _`executeAiTool()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `{ resolvePermanentNvmNode }`, `name`, `version` to the rest of the system?**
  _357 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `prescription.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10465116279069768 - nodes in this community are weakly interconnected._
- **Should `whatsapp-ai.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08549019607843138 - nodes in this community are weakly interconnected._