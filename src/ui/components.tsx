import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, SvgXml } from 'react-native-svg';
import iconPaths from '../../assets/ui-icons.json';
import { brandMark, brandReverse, brandWordmark } from './brand';
import { colors as c } from './theme';
import { localDate, recordSummary, type FarmRecord, type Reference, type Turn } from '../domain';

export type IconName = keyof typeof iconPaths;
export type Tab = 'Ask' | 'Records' | 'Library' | 'Devices' | 'Setup';
export const tabs: { name: Tab; icon: IconName; detail: string }[] = [
  { name: 'Ask', icon: 'chat', detail: 'Questions and photos' },
  { name: 'Records', icon: 'records', detail: 'Milk, feed and observations' },
  { name: 'Library', icon: 'book', detail: 'Farm reference guides' },
  { name: 'Devices', icon: 'device', detail: 'Nearby sensors and bulb controls' },
  { name: 'Setup', icon: 'settings', detail: 'Device and model files' },
];

export function Icon({ name, size = 20, color = c.forest }: { name: IconName; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" accessible={false} aria-hidden={true}>{iconPaths[name].map((d, index) => <Path key={index} d={d} />)}</Svg>;
}

export function Logo({ width = 150, mark = false, reverse = false }: { width?: number; mark?: boolean; reverse?: boolean }) {
  return <View accessible accessibilityRole="image" accessibilityLabel="DairyOS" style={{ width, height: mark ? width : width * 128 / 470, flexShrink: 0 }}><SvgXml xml={mark ? brandMark : reverse ? brandReverse : brandWordmark} width="100%" height="100%" accessible={false} aria-hidden={true} /></View>;
}

export function Button({ label, displayLabel, onPress, disabled, variant = 'primary', icon, iconOnly = false, style }: {
  label: string; displayLabel?: string; onPress: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: IconName; iconOnly?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const color = variant === 'danger' ? c.danger : c.forest;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, variant === 'secondary' && s.secondary, variant === 'ghost' && s.ghost, variant === 'danger' && s.ghost, iconOnly && s.iconOnly, disabled && s.disabled, pressed && !disabled && s.pressed, style]}>
    {icon && <Icon name={icon} color={color} size={18} />}{!iconOnly && <Text style={[s.buttonText, { color }]}>{displayLabel ?? label}</Text>}
  </Pressable>;
}

export function Input({ label, hint, leadingIcon, style, onFocus, onBlur, ...props }: React.ComponentProps<typeof TextInput> & { label?: string; hint?: string; leadingIcon?: IconName }) {
  const [focused, setFocused] = useState(false);
  return <View style={s.inputGroup}>
    {label && <View style={s.fieldLabelRow}><Text style={s.fieldLabel}>{label}</Text>{hint && <Text style={s.hint}>{hint}</Text>}</View>}
    <View style={[s.inputOutline, focused && s.inputFocused, props.editable === false && s.inputDisabled]}>{leadingIcon && <View style={s.inputIcon}><Icon name={leadingIcon} color={c.muted} size={19} /></View>}<TextInput {...props} accessibilityLabel={props.accessibilityLabel ?? label} placeholderTextColor={c.muted} onFocus={event => { setFocused(true); onFocus?.(event); }} onBlur={event => { setFocused(false); onBlur?.(event); }} style={[s.input, props.multiline && s.multiline, leadingIcon && { paddingLeft: 0 }, style]} /></View>
  </View>;
}

export function Badge({ label = 'Works offline', warning = false }: { label?: string; warning?: boolean }) {
  return <View style={[s.badge, warning && { backgroundColor: c.warningBg }]}><View style={[s.dot, warning && { backgroundColor: c.warning }]} /><Text style={[s.badgeText, warning && { color: c.warning }]}>{label}</Text></View>;
}

export function Navigation({ active, onChange, desktop = false }: { active: Tab; onChange: (tab: Tab) => void; desktop?: boolean }) {
  return <View accessibilityRole="tablist" style={desktop ? s.sideNav : s.bottomNav}>{tabs.map(tab => {
    const selected = active === tab.name;
    return <Pressable key={tab.name} accessibilityRole="tab" accessibilityLabel={tab.name} accessibilityState={{ selected }} onPress={() => onChange(tab.name)} style={({ pressed }) => [desktop ? s.sideTab : s.bottomTab, desktop && selected && s.sideSelected, pressed && s.pressed]}>
      {!desktop && selected && <View style={s.activeLine} />}<Icon name={tab.icon} color={desktop ? selected ? c.lime : c.onForest : selected ? c.forest : c.muted} size={desktop ? 23 : 22} />
      <View style={desktop ? s.sideLabels : undefined}><Text style={[s.navLabel, desktop && s.sideLabel, selected && s.selectedLabel, desktop && { color: selected ? c.white : c.onForest }]}>{tab.name}</Text>{desktop && <Text style={s.sideDetail}>{tab.detail}</Text>}</View>
    </Pressable>;
  })}</View>;
}

export function Heading({ eyebrow, title, subtitle, action, wide = false }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode; wide?: boolean }) {
  return <View style={s.heading}><Text style={s.eyebrow}>{eyebrow}</Text><View style={s.headingRow}><Text accessibilityRole="header" style={[s.title, wide && { fontSize: 36, lineHeight: 42 }]}>{title}</Text>{action}</View><Text style={s.subtitle}>{subtitle}</Text></View>;
}

export function TodaySummary({ records, onOpen }: { records: FarmRecord[]; onOpen?: () => void }) {
  const summary = records.length ? JSON.parse(recordSummary(records, 'today', localDate())) as { dailyTotals: { recordedMilkLitres: number | null; recordedFeedKg: number | null }[] } : undefined;
  const day = summary?.dailyTotals[0];
  const number = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return <View style={s.summary}><View style={s.summaryHeading}><Text style={s.summaryEyebrow}>TODAY’S RECORDS</Text>{onOpen && <Pressable accessibilityRole="button" accessibilityLabel="View records" onPress={onOpen} style={s.summaryLink}><Text style={s.summaryLinkText}>View records</Text><Icon name="arrow" color={c.onForest} size={14} /></Pressable>}</View><View style={s.totals}>
    <View style={s.total}><Text style={s.totalLabel}>Milk recorded</Text><Text style={s.totalValue}>{number(day?.recordedMilkLitres)} <Text style={s.totalUnit}>L</Text></Text></View>
    <View style={[s.total, s.totalDivider]}><Text style={s.totalLabel}>Feed recorded</Text><Text style={s.totalValue}>{number(day?.recordedFeedKg)} <Text style={s.totalUnit}>kg</Text></Text></View>
  </View><Text style={s.summaryFootnote}>{day ? 'Saved entries only. These amounts may be incomplete.' : 'No entries today. Add your measured amounts in Records.'}</Text></View>;
}

export function PromptList({ onChoose, disabled }: { onChoose: (question: string) => void; disabled: boolean }) {
  const prompts: { icon: IconName; title: string; detail: string; question: string }[] = [
    { icon: 'milk', title: 'Milk today', detail: 'Look up your saved milk total', question: 'Milk today' },
    { icon: 'water', title: 'Clean milking routine', detail: 'Practical steps for the next milking', question: 'How do I keep milking clean?' },
    { icon: 'feed', title: 'Poultry water', detail: 'Drinking water and housing basics', question: 'How can I improve drinking water and housing for chickens?' },
    { icon: 'leaf', title: 'Crop inspection', detail: 'Know what to check in the field', question: 'What should I check before treating a crop problem?' },
  ];
  return <View><Text style={s.sectionTitle}>A place to start</Text><View style={s.dividedList}>{prompts.map(prompt => <Pressable key={prompt.title} accessibilityRole="button" accessibilityLabel={prompt.title} accessibilityState={{ disabled }} disabled={disabled} onPress={() => onChoose(prompt.question)} style={({ pressed }) => [s.prompt, pressed && s.pressed, disabled && s.disabled]}><View style={s.rowIcon}><Icon name={prompt.icon} color={c.forest2} /></View><View style={s.grow}><Text style={s.rowTitle}>{prompt.title}</Text><Text style={s.rowDetail}>{prompt.detail}</Text></View><Icon name="chevron" color={c.muted} size={16} /></Pressable>)}</View></View>;
}

export function Disclosure({ title, detail, icon = 'info', children, initiallyOpen = false }: { title: string; detail?: string; icon?: IconName; children: React.ReactNode; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <View style={s.disclosure}><Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={s.disclosureHeader}><Icon name={icon} color={c.forest2} size={22} /><View style={s.grow}><Text style={s.rowTitle}>{title}</Text>{detail && <Text style={s.rowDetail}>{detail}</Text>}</View><Icon name={open ? 'down' : 'chevron'} color={c.muted} size={17} /></Pressable>{open && <View style={s.disclosureBody}>{children}</View>}</View>;
}

export function guideCategory(reference: Reference): 'livestock' | 'crops' | 'notes' {
  return reference.id.startsWith('local-') ? 'notes' : reference.id.includes('crop') ? 'crops' : 'livestock';
}

export function ReferenceCard({ reference, expanded = false }: { reference: Reference; expanded?: boolean }) {
  const [open, setOpen] = useState(expanded);
  const category = guideCategory(reference);
  const icon: IconName = category === 'crops' ? 'leaf' : category === 'notes' ? 'book' : reference.id.includes('hygiene') ? 'milk' : reference.id.includes('feed') || reference.id.includes('poultry') ? 'feed' : 'observation';
  const source = category === 'notes' ? 'User-provided local note; not independently verified' : reference.id.startsWith('csu') ? 'CSU Extension · Crop inspection' : reference.id.includes('hygiene') ? 'FAO / IDF · Milking hygiene' : 'FAO · Farm guidance';
  return <View style={s.reference}><Pressable accessibilityRole="button" accessibilityLabel={reference.title} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={s.referenceHeader}><View style={s.referenceTop}><View style={s.smallRowIcon}><Icon name={icon} size={18} color={c.forest2} /></View><Text style={s.referenceCategory}>{category === 'crops' ? 'CROPS' : category === 'notes' ? 'YOUR NOTE' : 'LIVESTOCK'}</Text></View><Text style={s.referenceTitle}>{reference.title}</Text><View style={s.referenceBottom}><Text style={s.referenceSource}>{source}</Text><Icon name={open ? 'down' : 'chevron'} color={c.muted} size={16} /></View></Pressable>{open && <View style={s.referenceBody}><Text selectable style={s.body}>{reference.text}</Text><Text selectable style={s.citation}>{reference.section}{'\n'}{reference.source}</Text></View>}</View>;
}

function Inline({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <Text key={index} style={s.strong}>{part.slice(2, -2)}</Text> : part)}</>;
}
export function AnswerText({ text }: { text: string }) {
  return <View style={s.answerBlocks}>{text.split(/\n\s*\n/).filter(Boolean).map((block, index) => {
    const lines = block.split('\n');
    if (lines.every(line => /^(?:\d+\.|[-•])\s+/.test(line))) return <View key={index} style={s.answerList}>{lines.map((line, row) => { const match = line.match(/^(\d+\.|[-•])\s+(.*)$/)!; return <View key={row} style={s.answerListRow}><Text style={s.listMarker}>{match[1] === '-' ? '•' : match[1]}</Text><Text selectable style={[s.body, s.grow]}><Inline text={match[2]!} /></Text></View>; })}</View>;
    return <Text key={index} selectable style={s.body}><Inline text={block.replace(/^#{1,3}\s+/gm, '')} /></Text>;
  })}</View>;
}

export function ConversationTurn({ turn }: { turn: Turn }) {
  return <View style={s.conversationTurn}><View style={s.questionBubble}>{turn.photo && <View style={s.photoLabel}><Icon name="image" size={14} color={c.forest2} /><Text style={s.questionMeta}>Farm photo</Text></View>}<Text selectable style={s.questionText}>{turn.question}</Text></View><View style={s.answerHeading}><Logo mark width={27} /><Text style={s.assistantName}>DairyOS</Text><Text style={s.answerTime}>{new Date(turn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>{turn.status === 'stopped' && <Text style={s.partial}>Partial answer</Text>}</View><View style={s.answerPanel}><AnswerText text={turn.answer} />{turn.references.length > 0 && <Disclosure title={`Sources (${turn.references.length})`} detail="Local reference material supplied to this answer" icon="book">{turn.references.map(reference => <ReferenceCard key={reference.id} reference={reference} />)}</Disclosure>}</View></View>;
}

export const s = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 }, body: { fontSize: 16, lineHeight: 25, color: c.ink }, caption: { fontSize: 13, lineHeight: 20, color: c.muted }, strong: { fontWeight: '700', color: c.forest },
  button: { minHeight: 46, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 9, backgroundColor: c.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonText: { fontSize: 14, lineHeight: 20, fontWeight: '700', flexShrink: 1 }, secondary: { backgroundColor: c.sage }, ghost: { backgroundColor: 'transparent', paddingHorizontal: 10 }, iconOnly: { width: 44, minHeight: 44, paddingHorizontal: 0, paddingVertical: 0 }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.72 },
  inputGroup: { minWidth: 0, gap: 7 }, fieldLabelRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }, fieldLabel: { fontSize: 14, fontWeight: '600', color: c.forest }, hint: { fontSize: 12, color: c.muted }, inputOutline: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.controlBorder, borderRadius: 9, backgroundColor: c.white }, inputFocused: { borderColor: c.forest }, inputDisabled: { backgroundColor: c.cream }, inputIcon: { paddingLeft: 13, paddingRight: 9 }, input: { flex: 1, minWidth: 0, minHeight: 46, padding: 13, fontSize: 16, color: c.ink, backgroundColor: 'transparent' }, multiline: { minHeight: 82, textAlignVertical: 'top' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.softGreen, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7, flexShrink: 0 }, dot: { width: 5, height: 5, borderRadius: 4, backgroundColor: c.forest2 }, badgeText: { fontSize: 11, fontWeight: '700', color: c.forest2 },
  bottomNav: { flexDirection: 'row', borderTopWidth: 1, borderColor: c.line, backgroundColor: c.white, paddingHorizontal: 8 }, bottomTab: { flex: 1, minHeight: 65, paddingTop: 10, paddingBottom: 7, alignItems: 'center', justifyContent: 'center', gap: 4 }, activeLine: { position: 'absolute', top: 0, width: 25, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: c.green }, navLabel: { fontSize: 11, color: c.muted, fontWeight: '500' }, selectedLabel: { fontWeight: '700', color: c.forest }, sideNav: { gap: 8 }, sideTab: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, minHeight: 72, borderRadius: 9 }, sideSelected: { backgroundColor: '#244D3A' }, sideLabels: { flex: 1, minWidth: 0 }, sideLabel: { fontSize: 15 }, sideDetail: { fontSize: 11, lineHeight: 17, color: c.onForest, marginTop: 4 },
  heading: { gap: 9, marginBottom: 4 }, eyebrow: { color: c.muted, fontSize: 11, lineHeight: 17, letterSpacing: 1.3, fontWeight: '600' }, headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }, title: { fontSize: 28, lineHeight: 34, letterSpacing: -0.8, fontWeight: '700', color: c.forest, flexShrink: 1 }, subtitle: { fontSize: 15, lineHeight: 23, color: c.muted, maxWidth: 590 }, sectionTitle: { fontSize: 16, lineHeight: 24, color: c.forest, fontWeight: '700', marginBottom: 12 },
  summary: { backgroundColor: c.forest, borderRadius: 13, paddingHorizontal: 20, paddingBottom: 19, paddingTop: 7 }, summaryHeading: { flexDirection: 'row', minHeight: 44, justifyContent: 'space-between', alignItems: 'center', gap: 8 }, summaryEyebrow: { color: c.onForest, fontSize: 10, letterSpacing: 1.1, fontWeight: '600' }, summaryLink: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }, summaryLinkText: { color: '#E1EFDB', fontSize: 11, fontWeight: '500' }, totals: { flexDirection: 'row', marginTop: 3 }, total: { flex: 1, minWidth: 0 }, totalDivider: { borderLeftWidth: 1, borderColor: c.forestLine, paddingLeft: 20, marginLeft: 16 }, totalLabel: { color: c.onForest, fontSize: 12, lineHeight: 18 }, totalValue: { color: c.white, fontSize: 30, lineHeight: 42, fontWeight: '500', marginTop: 2, letterSpacing: -0.5 }, totalUnit: { color: c.onForest, fontSize: 15, letterSpacing: 0 }, summaryFootnote: { color: c.onForest, fontSize: 11, lineHeight: 17, marginTop: 11 },
  dividedList: { borderTopWidth: 1, borderColor: c.line }, prompt: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: 70, borderBottomWidth: 1, borderColor: c.line }, rowIcon: { width: 37, height: 37, borderRadius: 9, backgroundColor: c.sage, alignItems: 'center', justifyContent: 'center' }, rowTitle: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: c.forest }, rowDetail: { fontSize: 12, lineHeight: 18, color: c.muted, marginTop: 3 },
  disclosure: { borderBottomWidth: 1, borderColor: c.line }, disclosureHeader: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 74, paddingVertical: 16 }, disclosureBody: { gap: 13, paddingBottom: 20 },
  reference: { borderWidth: 1, borderColor: c.line, borderRadius: 12, backgroundColor: c.white, overflow: 'hidden', minWidth: 0 }, referenceHeader: { padding: 17, minHeight: 110 }, referenceTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, smallRowIcon: { width: 31, height: 31, borderRadius: 8, backgroundColor: c.sage, justifyContent: 'center', alignItems: 'center' }, referenceCategory: { fontSize: 10, letterSpacing: 1.1, fontWeight: '600', color: c.muted }, referenceTitle: { fontSize: 16, lineHeight: 23, color: c.forest, fontWeight: '600', marginTop: 12, marginBottom: 11 }, referenceBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, referenceSource: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 18, color: c.muted }, referenceBody: { gap: 14, padding: 17, borderTopWidth: 1, borderColor: c.line }, citation: { fontSize: 12, lineHeight: 19, color: c.muted },
  conversationTurn: { gap: 14, marginBottom: 8 }, questionBubble: { alignSelf: 'flex-end', maxWidth: '90%', paddingVertical: 13, paddingHorizontal: 17, backgroundColor: '#E3EDE5', borderRadius: 16, borderBottomRightRadius: 4 }, questionText: { color: c.forest, fontSize: 16, lineHeight: 24 }, photoLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }, questionMeta: { color: c.forest2, fontSize: 11 }, answerHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, assistantName: { fontSize: 13, fontWeight: '700', color: c.forest }, answerTime: { fontSize: 11, color: c.muted, marginLeft: 4 }, partial: { fontSize: 11, color: c.warning, marginLeft: 'auto' }, answerPanel: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 13, padding: 18, gap: 15 }, answerBlocks: { gap: 13 }, answerList: { gap: 9 }, answerListRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, listMarker: { minWidth: 18, fontSize: 16, lineHeight: 25, color: c.forest, fontWeight: '600' },
});
