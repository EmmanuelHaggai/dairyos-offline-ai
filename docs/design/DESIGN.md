# DairyOS Local UI direction

The mobile app should feel like the existing DairyOS website while making four offline tasks easy: ask a question, record farm activity, read a reference, and prepare the device for the field.

## Brand evidence

The website's actual `dairyos-site.css` supplies forest `#12372A`, secondary forest `#1B4D3A`, green `#42B96B`, lime `#B7E445`, ink `#17251F`, muted text `#60736B`, cream `#F4F7F3` and dividers `#DCE7DF`. Its font stack is Segoe UI/Arial. The app will use an offline system/Arial stack appropriate to each platform.

The official v2 mark depicts a connected farm above cultivated fields. Normal and reversed wordmarks are copied from the production website. Their original shapes and colors are preserved; no replacement logo is invented. See [asset provenance](../../assets/brand/SOURCE.md).

## Online research and interpretation

- [NN/g's evaluation of AI prototyping tools](https://www.nngroup.com/articles/ai-prototyping/) found generic visual output and priorities that did not necessarily match the task. It supports supplying an explicit brand system, concrete workflows and interaction states rather than accepting the first polished screen.
- [NN/g's aesthetic and minimalist design guidance](https://www.nngroup.com/articles/aesthetic-minimalist-design/) emphasizes useful information and clear hierarchy. This is the reason to remove introductory walls of text, repeated ornamental cards and technical setup details from the question flow.
- [A practitioner's account of repeated AI website patterns](https://www.joshuasnoddy.com/blog/why-ai-websites-look-the-same/) describes familiar gradients, glass cards and interchangeable layouts. These are review prompts, not evidence that any particular design was made by AI. Human designers also use these patterns.
- [Apple's interface design advice](https://developer.apple.com/design/tips/) calls for layouts that fit without horizontal scrolling, readable text and controls at least 44 by 44 points. These are concrete implementation checks.
- [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) specifies 4.5:1 for ordinary text and 3:1 for large text, with a logo exception. The site's bright green should carry dark text when used as a button; white text on that green is insufficient for small labels.

There is no reliable visual test here for attributing authorship to AI. This review evaluates quality, consistency and usability rather than trying to hide or prove a tool's involvement.

## Wireframe decisions

1. Mobile: official wordmark in the header, four labeled bottom destinations and a question composer that remains accessible above navigation. Desktop: forest sidebar and a separate farm-context column.
2. Ask: concise task heading, actual dated milk/feed coverage and a compact divided list of useful starter questions. No sample totals, fabricated trends or synthetic activity feed.
3. Records: visible labels, an explicit add-record action, clear milk/feed/observation selection and dated entries. Missing entries remain unknown rather than zero.
4. Library: livestock/crop/local-note filters, searchable titles and expandable source material. The source remains available offline.
5. Setup: farm name and model-file readiness first; model filenames, metrics, pilot limitations and signing notes are available in disclosures. File presence is not presented as proof of model accuracy.

## Review gates before implementation

- Inspect the wireframes and branded mockups at phone and computer sizes.
- Check the real logo, hierarchy, line lengths, alignment, color roles and primary-action placement.
- Remove decoration that does not communicate a task or state. Use one consistent set of line icons; no sparkle motif or emoji navigation.
- Distinguish a missing value, an empty collection, a disabled control, a busy request and an error.
- Carry the existing inference, model checks and data storage through unchanged.

## Implementation acceptance

Measure horizontal overflow at 320, 390, 428, 768 and 1280 px. Inspect all screens, the open form, expanded references and a populated conversation. Check target sizes, contrast pairs, accessible control labels, visible keyboard focus and logo rendering. Run the existing command/record browser checks and native pilot tests where the phone is available. This is an engineering/heuristic review, not a claim of formal usability research with farmers.

## Implemented and reviewed

The design is implemented in `App.tsx`, `src/ui/components.tsx` and `src/ui/theme.ts`. The official vector logo is rendered locally in the header, sidebar and assistant avatar. Direct renders of the same mark provide the opaque iPhone app icon. The release is 0.2.0, build 3.

The grayscale structure study is [wireframes.html](wireframes.html); the branded concept is [mockups.html](mockups.html). PNG exports are alongside them. Actual implemented screens are in [screens](screens/), including an open record form, a populated conversation and an expanded crop guide. Their sample records belong to a separate browser test profile, not the farmer's storage.

| Finding | Correction |
| --- | --- |
| Generic text-only branding | Official normal/reverse wordmarks and connected-farm mark, including the iPhone icon |
| Scattered color choices | Website-derived forest/green/lime tokens with a small set of supporting colors |
| Long technical introductions | Task-focused copy; model filenames, metrics and renewal details in disclosures |
| Repeated ornamental feature cards | Compact divided starter-question list and purposeful record/reference groups |
| Empty totals could look invented | Actual dated records; a dash and an explanation when no entry exists |
| Composer disappeared below chat | Persistent question input above labeled mobile navigation |
| Long attachment labels clipped at 390 px | Familiar icon controls on narrower screens, with explicit accessible names |
| Summary occupied the entry form's working space | Summary hidden while the record form is open |
| Summary action opened the wrong content on Records | Removed that redundant link; the explicit Add record action opens the form |
| Placeholder-only forms | Persistent visible labels, units, optional/required hints and visible input focus |
| Caption contrast was 4.42:1 on sage | Darkened that caption to secondary forest; current sampled text passes thresholds |
| Raw assistant Markdown | Safe text-only rendering of paragraphs, bold emphasis and numbered/bulleted steps |
| Singular replies said “1 entries” | Correct singular/plural entry wording |
| SVG metadata repeated identifiers | Removed duplicate metadata IDs in embedded copies; retained original source SVG files |
| Unsupported model-import buttons in the web shell | Shown only in the native Expo path that implements the picker; USB refresh remains available |

Measured review: 320, 390, 428, 768 and 1280 px; no document overflow; no measured interactive target below 44×44; no duplicate IDs; no browser runtime exceptions; 638 rendered text samples checked with no contrast failures. This is a sampled engineering audit, not full WCAG certification. Logos and disabled controls are treated according to the contrast exceptions.

Twenty-five domain/lifecycle checks, TypeScript, lint and the existing 22-flow browser check pass. The initial real-model browser run completed English generation but stopped on a stale test assertion looking for visible “Remove photo” text after that control became an accessible icon button. The corrected focused test passed photo selection, attachment display, a real local QVAC photo request and persisted photo guidance, along with the standard command/record checks. Report: `.private/ui-photo-browser-check.log`. DOM wait predicates now return booleans rather than attempting to serialize DOM nodes.

The native release compiled and installed using the existing bundle ID and Personal Team. iOS required developer verification before opening the new signed build. After the user verified it and confirmed Wi-Fi and cellular data off, all 15 native acceptance checks and four restart/persistence checks passed on the iPhone. Text guidance took 9.22 s. The sample photo triggered the guarded offline-reference fallback in 1.03 s; it was not reported as a successful visual diagnosis. All three model hashes matched. The app was returned to normal mode, with its normal data namespace unchanged. Report: `.private/ui-iphone-acceptance.log`; the actual phone rendering is `screens/iphone-records.png`.

Production website files were read only and were not changed. No new cloud service, online font, external image or runtime website dependency was added.
