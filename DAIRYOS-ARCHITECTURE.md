# DairyOS local AI groundwork

Inspected over authorized, read-only SSH on 30 October 2026. No production files, databases, services, or device states were changed. This local workspace was initially empty.

## Existing application

- Main application: `/var/www/DairyOS`, classic modular CodeIgniter PHP/MySQL, served by Apache. No Composer or Node runtime installation for the PHP application.
- Modules include farm/team management, animal registry, milk, breeding, health, feeding, poultry, cameras, IoT devices, weather/pasture advisory, intelligence, alerts, tasks and finances. Presence of a legacy module does not establish that it is enabled or tenant-safe.
- `application/libraries/Tenant_context.php` resolves authenticated users, active farm memberships, selected farm, roles and enabled enterprises. Owner/manager write permission is explicit.
- Deployment documentation warns against enabling legacy modules until all reads, writes, exports and files are farm-scoped.
- Production working tree contains numerous modified and untracked files. Preserve the current filesystem rather than assuming Git HEAD represents the deployed app.

## Existing AI and automation

### WhatsApp assistant

Code: `/var/www/DairyOS_whatsapp_ai/app/`.

The existing shared callback routes messages into a queue processed by `dairyos-whatsapp-ai.service`. Sender identity is resolved through verified account links and active farm memberships. Users with multiple farms select one they can access.

`farm_assistant.php` contains:

- `dairy_context()`: bounded, farm-scoped profile, pasture, zones, enterprises, animals, dated milk records, flock movement-ledger inventory, houses, alerts and IoT context.
- `dairy_ai_payload()`: instructions, authorized records, recent conversation and optional image. Supports English and Kiswahili guidance.
- `dairy_ai()`: currently calls OpenAI Responses directly and parses output text. This is a useful inference-provider integration point.
- `dairy_reply()`: authentication, farm selection, rate limiting, context/history and routing. Some basic commands return deterministic summaries without AI.

History is scoped to user and farm, limited to six completed exchanges within 24 hours. Documentation specifies seven-day job retention and membership/link revalidation before sending.

Normal guidance has no database write tools. Device control is a separate path in `iot_assistant.php`, backed by `Farm_iot_service.php`: structured intent, configured-device validation, farm matching, authorization and duplicate-command handling. Requested output state is distinct from device-confirmed state. Any local AI provider must preserve these checks.

### Poultry vision

`/var/www/DairyOS/vision_service/worker.py` runs as `dairyos-vision-worker.service`, using CPU PyTorch/Ultralytics/OpenCV installed under `/opt/dairyos-vision/venv`. A local person/feeder verifier supplements detection. The worker claims tenant-scoped jobs through authenticated internal APIs without database credentials.

Local detections already operate without OpenAI. Optional image/count reviews use OpenAI. Visible estimates do not update authoritative flock inventory. Existing license/configuration gates and validated detection behavior must be preserved.

### Advisory and IoT

`Advisory_engine.php` evaluates deterministic heat, rain/wind and dry-spell rules. Weather, satellite and sensor context feed advisory/intelligence workflows. Arduino gateways poll outputs and report telemetry/acknowledgements using per-gateway tokens. LLM interpretation should not replace these deterministic controls.

## Observed Contabo capacity

- Ubuntu 24.04.3 LTS, x86_64, six AMD EPYC virtual CPUs.
- Approximately 11 GiB RAM total; 6.9 GiB available at inspection; no swap.
- Approximately 32 GiB disk available at inspection.
- Node v22.17.0.
- No `/dev/dri` device listed; GPU acceleration was not established.
- Shared host with many other production services, including continuous vision processing.

## Proposed first implementation

Superseded by the user's mandatory offline iPhone requirement. The current implementation and test path are described in README.md. Contabo is not a runtime dependency of the mobile app.

This is a proposal, not an installed or tested implementation.

1. Build a configurable local inference provider alongside the existing cloud provider. Keep authorization, farm-context construction and business logic in PHP.
2. Evaluate QVAC on a separate development runtime first. The QVAC documentation reviewed earlier lists Node 22.21+ on the Node 22 line for its CLI; the server's existing Node is older. Avoid replacing a shared runtime without checking dependent services.
3. Benchmark a small quantized text model with bounded context and single-request concurrency. Measure English/Kiswahili quality, record/date accuracy, latency, peak memory and impact on the vision worker.
4. Verify the selected QVAC HTTP endpoints and request/response shapes against the existing Responses API payload; OpenAI compatibility does not establish drop-in compatibility.
5. Initially support text guidance and farm-record questions. Evaluate image models and IoT structured intent separately before routing those tasks to a local model.
6. Keep inference bound to loopback or an authenticated private channel. Give the inference process no database credentials or direct device-control access.
7. Test farm isolation, revoked access, stale/missing records, prompt injection, provider outages and control validation. Use synthetic data first; avoid sending WhatsApp messages during automated checks.

“Local” needs an implementation target: inference on this Contabo VPS is self-hosted but still remote from the farm/phone. Fully offline farm or iPhone inference requires deployment on that hardware. WhatsApp transport itself remains internet-dependent.

## Inspection limits

Reviewed source, deployment/operations documents, service inventory and host resources. Did not perform an authenticated browser walkthrough, read customer records, export secrets, run live AI requests, benchmark models, or install QVAC. No production tests were executed because some tests can touch production services or records.
