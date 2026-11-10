import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Device from 'expo-device';
import { starterLibrary } from './data/library';
import type { FarmRecord, RecordKind, Reference, Turn } from './src/domain';
import { localDate, retrieve } from './src/domain';
import { addNote, addRecord, clearTurns, deleteNote, deleteRecord, getNotes, getRecords, getSetting, getTurns, saveTurn, setSetting } from './src/storage';
import { importModel, modelState, refreshModels, type ModelSlot } from './src/files';
import { answerQuestion, stopInference } from './src/inference';
import { expectedModelBytes } from './src/model-specs';
import { phoneRequest, phoneShell } from './src/phone-shell';
import { Badge, Button, ConversationTurn, Disclosure, Heading, Icon, Input, Logo, Navigation, PromptList, ReferenceCard, TodaySummary, guideCategory, s, type Tab } from './src/ui/components';
import { Devices } from './src/ui/Devices';
import { bleSnapshot, subscribeBLE, executeBulbBLE, ensureBLEConnection, startAutomaticBLE, setBLEForeground } from './src/ble/client';
import { liveReading, boardPresence } from './src/ble/state';
import { describeFarmReading } from './src/ble/chat-intents';
import { validateIntent } from './src/ble/semantic-intent';
import { bulbCommand } from './src/ble/output-policy';
import { colors as c } from './src/ui/theme';

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const today = () => localDate();
function confirmRemoval(title: string, message: string, remove: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(title + '\n' + message)) remove(); }
  else Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: remove }]);
}

export default function App() {
  const [ble, setBle] = useState(bleSnapshot);
  useEffect(() => subscribeBLE(setBle), []);
  useEffect(() => startAutomaticBLE(), []);
  const [tab, setTab] = useState<Tab>('Ask');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('Preparing local storage…');
  const [question, setQuestion] = useState('');
  const [photo, setPhoto] = useState<string>();
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState<{ text: string; photo?: string }>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [failure, setFailure] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [records, setRecords] = useState<FarmRecord[]>([]);
  const [notes, setNotes] = useState<Reference[]>([]);
  const [models, setModels] = useState(modelState);
  const [farmName, setFarmName] = useState('My farm');
  const [farmDraft, setFarmDraft] = useState('');
  const [kind, setKind] = useState<RecordKind>('milk');
  const [date, setDate] = useState(today);
  const [animal, setAnimal] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteText, setNoteText] = useState('');
  const [metrics, setMetrics] = useState('No device inference measured yet.');
  const [recordFormOpen, setRecordFormOpen] = useState(false);
  const [noteFormOpen, setNoteFormOpen] = useState(false);
  const [category, setCategory] = useState<'all' | 'livestock' | 'crops' | 'notes'>('all');
  const scroll = useRef<ScrollView>(null);
  const requestInFlight = useRef(false);
  const followLatest = useRef(true);
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const preview = Platform.OS === 'web' && !phoneShell;
  const roomy = width >= 640;
  const library = [...starterLibrary, ...notes];
  const locked = busy || working || !loaded;
  const textReady = models.text?.bytes === expectedModelBytes.text;
  const installedModels = (Object.keys(expectedModelBytes) as ModelSlot[]).filter(slot => models[slot]?.bytes === expectedModelBytes[slot]).length;
  const filteredLibrary = library.filter(reference => category === 'all' || guideCategory(reference) === category);
  const visibleLibrary = librarySearch.trim() ? retrieve(librarySearch, filteredLibrary, 200) : filteredLibrary;

  const revealLatest = useCallback(() => {
    requestAnimationFrame(() => {
      if (!followLatest.current) return;
      scroll.current?.scrollToEnd({ animated: false });
      requestAnimationFrame(() => { if (followLatest.current) scroll.current?.scrollToEnd({ animated: false }); });
    });
  }, []);
  useEffect(() => {
    if (tab === 'Ask' && (turns.length || submitted || busy || failure)) revealLatest();
  }, [turns.length, tab, submitted, busy, status, answer, failure, revealLatest]);
  useEffect(() => { if (tab === 'Ask') { followLatest.current = true; revealLatest(); } }, [tab, revealLatest]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const pauseFollow = (event: Event) => {
      const viewport = document.getElementById('dairyos-chat-scroll');
      if (event.target instanceof Node && viewport?.contains(event.target)) followLatest.current = false;
    };
    document.addEventListener('wheel', pauseFollow, { passive: true, capture: true });
    document.addEventListener('pointerdown', pauseFollow, { passive: true, capture: true });
    return () => { document.removeEventListener('wheel', pauseFollow, true); document.removeEventListener('pointerdown', pauseFollow, true); };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const began = Date.now();
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - began) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (Platform.OS !== 'web' || document.getElementById('dairyos-interface-style')) return;
    const element = document.createElement('style'); element.id = 'dairyos-interface-style';
    element.textContent = '#dairyos-app{font-family:Arial,sans-serif;overflow-wrap:anywhere}#dairyos-app [role=button]:focus-visible,#dairyos-app [role=tab]:focus-visible{outline:2px solid #12372A;outline-offset:3px}#dairyos-sidebar [role=button]:focus-visible,#dairyos-sidebar [role=tab]:focus-visible{outline-color:#B7E445}#dairyos-app button,#dairyos-app input,#dairyos-app textarea{font:inherit}#dairyos-app input,#dairyos-app textarea{outline:none}#dairyos-app input:focus-visible,#dairyos-app textarea:focus-visible{outline:2px solid #12372A;outline-offset:2px}';
    document.head.appendChild(element);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [savedTurns, savedRecords, savedNotes, savedFarm] = await Promise.all([getTurns(), getRecords(), getNotes(), getSetting('farmName')]);
        setTurns(savedTurns); setRecords(savedRecords); setNotes(savedNotes);
        if (savedFarm) { setFarmName(savedFarm); setFarmDraft(savedFarm); }
        setLoaded(true); setStatus(Platform.OS === 'web' && !phoneShell ? 'Desktop preview · local browser records' : 'Ready · inference stays on this iPhone');
        void refreshModels().then(setModels).catch(() => {});
      } catch (error) { setStatus('Storage error: ' + errorText(error)); setFailure('Local storage could not be opened. ' + errorText(error)); }
    })();
    const listener = AppState.addEventListener('change', state => { setBLEForeground(state === 'active'); if (state !== 'active') void stopInference().catch(() => {}); });
    return () => { listener.remove(); void stopInference().catch(() => {}); };
  }, []);

  async function action(task: () => Promise<void>) {
    if (locked) return;
    setWorking(true);
    setFailure('');
    try { await task(); } catch (error) { setFailure(errorText(error)); requestAnimationFrame(() => scroll.current?.scrollTo({ y: 0, animated: true })); }
    finally { setWorking(false); }
  }
  async function selectPhoto(camera: boolean) {
    if (locked) return;
    if (phoneShell) { const selected = await phoneRequest<string | null>('photo', { camera }); if (selected) { removePhoto(); setPhoto(selected); } return; }
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) { Alert.alert('Camera permission needed', 'Allow the camera in Settings, or choose a local photo.'); return; }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 0.8, exif: false };
    const selection = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (selection.canceled || !selection.assets[0]) return;
    const asset = selection.assets[0];
    const size = asset.width > asset.height ? { width: Math.min(asset.width, 1024) } : { height: Math.min(asset.height, 1024) };
    const resized = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: size }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
    removePhoto(); setPhoto(resized.uri);
  }
  function removePhoto() {
    if (Platform.OS !== 'web' && photo?.startsWith(Paths.cache.uri)) { const file = new File(photo); if (file.exists) file.delete(); }
    setPhoto(undefined);
  }
  async function importTextNote() {
    const picked = await DocumentPicker.getDocumentAsync({ type: 'text/plain', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    if ((asset.size ?? 0) > 16000) throw new Error('Choose a text file under 16 KB.');
    let text: string;
    if (Platform.OS === 'web') {
      text = await (await fetch(asset.uri)).text();
    } else {
      const file = new File(asset.uri);
      try {
        if (file.size > 16000) throw new Error('Choose a text file under 16 KB.');
        text = await file.text();
      } finally { if (file.uri.startsWith(Paths.cache.uri) && file.exists) file.delete(); }
    }
    if (text.length > 4000) throw new Error('Split long notes into sections under 4,000 characters.');
    setNoteText(text); setNoteTitle(asset.name.slice(0, 100));
  }
  async function saveDeviceReply(text: string, response: string) {
    await saveTurn({ question: text, answer: response, createdAt: new Date().toISOString(), references: [], photo: false, elapsedMs: 0, status: 'complete' });
    setTurns(await getTurns()); setSubmitted(undefined); setMetrics('Request understood by local QVAC AI · board data stays local.');
  }
  async function send() {
    if (locked || requestInFlight.current) return;
    const text = question.trim() || (photo ? 'Describe this farm photo and suggest what I should check next.' : '');
    if (!text) return;
    const selectedPhoto = photo;
    requestInFlight.current = true; followLatest.current = true;
    setQuestion(''); setSubmitted({ text, photo: selectedPhoto });
    setBusy(true); setElapsedSeconds(0); setAnswer(''); setFailure(''); setStatus('Understanding your request…');
    Keyboard.dismiss();
    if (Platform.OS === 'web' && document.activeElement instanceof HTMLElement) document.activeElement.blur();
    try {
      if (phoneShell) await phoneRequest('interactionBusy', { active: true });
      await sendRequest(text, selectedPhoto);
    } catch (error) { setFailure(errorText(error)); }
    finally {
      if (phoneShell) await phoneRequest('interactionBusy', { active: false }).catch(() => {});
      requestInFlight.current = false; setBusy(false);
    }
  }
  async function sendRequest(text: string, selectedPhoto?: string) {
    if (!selectedPhoto) {
      try {
        let interpretation = await answerQuestion({ mode: 'intent', question: text, records: [], references: [], turns: [], onStatus: setStatus, onText: () => {} });
        if (interpretation.stopped || interpretation.limited) throw new Error('Request interpretation was interrupted. No command was sent.');
        let intent = validateIntent(interpretation.text);
        if (intent.kind === 'clarify' && turns.length) {
          interpretation = await answerQuestion({ mode: 'intent', question: text, records: [], references: [], turns, onStatus: setStatus, onText: () => {} });
          if (interpretation.stopped || interpretation.limited) throw new Error('Context interpretation was interrupted. No command was sent.');
          intent = validateIntent(interpretation.text);
        }
        if (intent.kind !== 'none') {
          if (intent.kind === 'clarify') await saveDeviceReply(text, intent.text);
          else {
            let connectionError = '';
            try { await ensureBLEConnection(setStatus); }
            catch (error) { connectionError = errorText(error); }
            const snapshot = bleSnapshot();
            if (intent.kind === 'command') {
              if (!liveReading(snapshot)) await saveDeviceReply(text, `No command was sent. ${connectionError}`);
              else {
                setStatus('Sending bulb command · waiting for board acknowledgment…');
                try {
                  const plan = bulbCommand(intent.target, intent.on, intent.seconds);
                  await executeBulbBLE(intent.target, intent.on, intent.seconds);
                  await saveDeviceReply(text, `${snapshot.simulated ? 'SIMULATION — no hardware was changed.\n' : ''}The board confirmed ${plan.description}.${!plan.persistent ? ` It returns ${intent.on ? 'OFF' : 'ON'} after the hold ends.` : ''}\nThis confirms the board report, not electrical lamp output.${bleSnapshot().reading?.protocolVersion === 2 ? bleSnapshot().reading?.syncPending ? '\nDatabase sync is queued on the board until it has internet.' : '\nThe board reports no local changes waiting for database sync.' : ''}`);
                } catch (error) { await saveDeviceReply(text, `I could not confirm the bulb command. ${errorText(error)} No automatic retry was made.`); }
              }
            } else await saveDeviceReply(text, describeFarmReading(intent, snapshot) + (connectionError ? '\nConnection attempt: ' + connectionError : ''));
          }
          return;
        }
      } catch (error) { setFailure(errorText(error)); return; }

    }
    setAnswer(''); setFailure('');
    try {
      const result = await answerQuestion({ question: text, records, references: library, turns, localDate: today(), photoPath: selectedPhoto ? decodeURIComponent(selectedPhoto.replace('file://', '')) : undefined, onStatus: setStatus, onText: setAnswer });
      const body = (result.observation ? `Photo observations — unverified\n${result.observation}\n\nGuidance\n` : '') + result.text + (result.limited ? '\n\nPartial answer: the length limit was reached. Ask a narrower follow-up.' : '');
      if (!body.trim()) throw new Error(result.stopped ? 'Stopped before an answer was ready. No command was sent.' : 'No answer was returned. Please try again.');
      if (body.trim()) {
        await saveTurn({ question: text, answer: body, createdAt: new Date().toISOString(), references: result.references, photo: !!selectedPhoto, elapsedMs: result.elapsedMs, status: result.stopped || result.limited ? 'stopped' : 'complete' });
        setTurns(await getTurns()); setSubmitted(undefined);
      }
      setMetrics(result.origin === 'records' ? 'Calculated directly from saved local records; no model used.' : result.origin === 'local' ? 'Immediate local response; no model used.' : result.origin === 'library' ? 'Unreliable photo assessment discarded; showing the offline inspection guide.' : `${result.stopped || result.limited ? 'Partial answer' : 'Completed'} in ${(result.elapsedMs / 1000).toFixed(1)}s. First generation token: ${result.firstTokenMs === undefined ? 'none' : (result.firstTokenMs / 1000).toFixed(1) + 's'}.`);
      setAnswer(''); removePhoto();
    } catch (error) { setFailure(errorText(error)); setAnswer(''); revealLatest(); }

  }
  function confirmClear() {
    confirmRemoval('Clear this conversation?', 'Local farm records and library notes will be kept.', () => { void action(async () => { await clearTurns(); setTurns([]); setSubmitted(undefined); setFailure(''); setAnswer(''); }); });
  }

  const dateHeading = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toLocaleUpperCase();
  const sendingBulb = busy && status.startsWith('Sending bulb command');
  const friendlyStatus = sendingBulb ? 'Waiting for the board to confirm…' : /understanding/i.test(status) ? 'Understanding your request…' : /checking/i.test(status) ? 'Checking the requested action…' : /connecting|bluetooth|nearby DairyOS/i.test(status) ? 'Connecting to your board…' : /photo/i.test(status) ? 'Looking at your photo…' : /writing/i.test(status) ? 'Writing your answer…' : /releasing|finishing/i.test(status) ? 'Finishing up…' : 'Preparing local AI…';

  const failureNotice = failure ? <View accessibilityRole="alert" style={styles.error}><View style={styles.errorHeading}><Icon name="info" color={c.danger} /><Text style={styles.errorTitle}>Could not complete that request</Text><Button label="Dismiss message" icon="close" iconOnly variant="danger" onPress={() => { setFailure(''); if (!busy) setSubmitted(undefined); }} /></View><Text selectable style={s.body}>{failure}</Text></View> : null;

  const renderRecords = () => <>
    <Heading eyebrow={farmName.toLocaleUpperCase()} title="Farm records" subtitle="Measured amounts and dated observations. Saved on this device." wide={desktop} action={<Button label={recordFormOpen ? 'Close form' : 'Add record'} icon={recordFormOpen ? 'close' : 'plus'} variant={recordFormOpen ? 'secondary' : 'primary'} disabled={locked} onPress={() => setRecordFormOpen(!recordFormOpen)} />} />
    {!recordFormOpen && <TodaySummary records={records} />}
    <View style={[styles.recordsLayout, roomy && styles.columns]}>
      {recordFormOpen && <View style={[styles.panel, styles.recordForm, roomy && { flex: 1 }]}>
        <Text style={s.sectionTitle}>New record</Text>
        <View style={styles.segments}>{(['milk', 'feed', 'observation'] as RecordKind[]).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value[0]!.toUpperCase() + value.slice(1)} accessibilityState={{ selected: kind === value, disabled: locked }} disabled={locked} onPress={() => setKind(value)} style={[styles.segment, kind === value && styles.segmentSelected]}>{width >= 380 && <Icon name={value === 'milk' ? 'milk' : value === 'feed' ? 'feed' : 'observation'} color={kind === value ? c.forest : c.muted} size={16} />}<Text style={[styles.segmentText, kind === value && { color: c.forest, fontWeight: '700' }]}>{value[0]!.toUpperCase() + value.slice(1)}</Text></Pressable>)}</View>
        <Input label="Date" accessibilityLabel="Record date" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} editable={!locked} maxLength={10} />
        <Input label="Animal or group" hint="optional" accessibilityLabel="Animal or group name" placeholder="e.g. Daisy or morning herd" value={animal} onChangeText={setAnimal} maxLength={100} editable={!locked} />
        {kind !== 'observation' && <Input label={kind === 'milk' ? 'Milk quantity' : 'Feed quantity'} hint={kind === 'milk' ? 'litres' : 'kilograms'} accessibilityLabel="Record quantity" placeholder="0.0" value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" editable={!locked} />}
        <Input label={kind === 'observation' ? 'Your observation' : 'Note'} hint={kind === 'observation' ? 'required' : 'optional'} accessibilityLabel="Record note" placeholder="Anything worth noting?" multiline value={note} onChangeText={setNote} maxLength={1000} editable={!locked} />
        <Button label="Save local record" icon="plus" disabled={locked} onPress={() => { void action(async () => { await addRecord({ kind, date, animal, quantity: quantity.trim() ? Number(quantity.replace(',', '.')) : null, note }); setRecords(await getRecords()); setQuantity(''); setNote(''); }); }} />
      </View>}
      <View style={[styles.entryColumn, roomy && { flex: 1 }]}>
        <View style={styles.sectionBar}><Text style={s.sectionTitle}>Saved entries</Text><Text style={s.caption}>{records.length} {records.length === 1 ? 'entry' : 'entries'}</Text></View>
        {!records.length && <View style={styles.emptyState}><View style={styles.emptyIcon}><Icon name="records" size={28} color={c.forest2} /></View><Text style={styles.emptyTitle}>Start with what you measure.</Text><Text style={s.caption}>Add a milk, feed or observation entry. Missing records mean unknown amounts, not zero.</Text></View>}
        {records.map(record => <View key={record.id} style={styles.entry}><View style={styles.entryHeading}><View style={s.rowIcon}><Icon name={record.kind === 'milk' ? 'milk' : record.kind === 'feed' ? 'feed' : 'observation'} color={c.forest2} /></View><View style={s.grow}><Text style={s.rowTitle}>{record.animal || (record.kind === 'observation' ? 'Farm observation' : 'Whole farm')}</Text><Text style={s.rowDetail}>{record.date} · {record.kind[0]!.toUpperCase() + record.kind.slice(1)}</Text></View>{record.quantity !== null && <Text style={styles.entryAmount}>{record.quantity} {record.kind === 'milk' ? 'L' : 'kg'}</Text>}<Button label="Delete record" icon="trash" iconOnly variant="danger" disabled={locked} onPress={() => confirmRemoval('Delete record?', 'This removes the local record.', () => { void action(async () => { await deleteRecord(record.id); setRecords(await getRecords()); }); })} /></View>{!!record.note && <Text style={[s.body, styles.entryNote]}>{record.note}</Text>}</View>)}
      </View>
    </View>
  </>;

  const renderLibrary = () => <>
    <Heading eyebrow="SAVED ON THIS DEVICE" title="Offline library" subtitle="Practical references for livestock and crops. Read them without a connection." wide={desktop} action={<Button label={noteFormOpen ? 'Close note form' : 'Add note'} icon={noteFormOpen ? 'close' : 'plus'} variant="secondary" disabled={locked} onPress={() => setNoteFormOpen(!noteFormOpen)} />} />
    <Input accessibilityLabel="Search local references" leadingIcon="search" placeholder="Search English or Kiswahili keywords" value={librarySearch} onChangeText={setLibrarySearch} />
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filters}>{([['all', 'All guides'], ['livestock', 'Livestock'], ['crops', 'Crops'], ['notes', 'My notes']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: category === value }} onPress={() => setCategory(value)} style={[styles.filter, category === value && styles.filterActive]}><Text style={[styles.filterText, category === value && { color: c.white, fontWeight: '700' }]}>{label}</Text></Pressable>)}</ScrollView>
    {noteFormOpen && <View style={styles.panel}><Text style={s.sectionTitle}>Add a local guidance note</Text><Text style={s.caption}>Keep advice from your extension officer here. Your notes are labelled as user-provided and not independently verified.</Text><Input label="Title and source" placeholder="Title and source / author" value={noteTitle} onChangeText={setNoteTitle} maxLength={100} editable={!locked} /><Input label="Guidance" placeholder="Paste a short note" multiline value={noteText} onChangeText={setNoteText} maxLength={4000} editable={!locked} /><View style={styles.row}><Button label="Choose local text file" icon="folder" variant="secondary" disabled={locked} onPress={() => { void action(importTextNote); }} /><Button label="Save reference note" icon="check" disabled={locked} onPress={() => { void action(async () => { await addNote(noteTitle, noteText); setNotes(await getNotes()); setNoteTitle(''); setNoteText(''); setCategory('notes'); setLibrarySearch(''); }); }} /></View><Text style={s.caption}>Plain text only. Split longer guidance into short sections.</Text></View>}
    <View style={styles.sectionBar}><Text style={s.caption}>{visibleLibrary.length} {visibleLibrary.length === 1 ? 'guide' : 'guides'}{librarySearch.trim() ? ' found' : ' available'}</Text><Text style={s.caption}>Tap a guide to read</Text></View>
    <View style={[styles.guideGrid, roomy && styles.guideGridWide]}>{visibleLibrary.map(reference => <View key={reference.id} style={[styles.guideCell, roomy && styles.guideCellWide]}><ReferenceCard reference={reference} />{reference.id.startsWith('local-') && <Button label="Delete local note" icon="trash" disabled={locked} variant="danger" onPress={() => { void action(async () => { await deleteNote(reference.id); setNotes(await getNotes()); }); }} />}</View>)}</View>
    {visibleLibrary.length === 0 && <View style={styles.emptyState}><Icon name="search" size={27} color={c.forest2} /><Text style={styles.emptyTitle}>{librarySearch.trim() ? 'No matching local passage.' : 'No guides in this collection yet.'}</Text><Text style={s.caption}>Try another keyword or collection, or add your own reference note.</Text></View>}
    <Text style={s.caption}>{starterLibrary.length} starter summaries with source details. This small pilot library is not complete veterinary or crop guidance.</Text>
  </>;

  const renderSetup = () => <>
    <Heading eyebrow="YOUR DEVICE" title="Ready for the field" subtitle="A few checks before you leave the connection behind." wide={desktop} />
    <View style={[styles.readiness, installedModels !== 3 && styles.readinessWarning]}><Icon name={installedModels === 3 ? 'check' : 'info'} size={27} color={installedModels === 3 ? c.forest2 : c.warning} /><View style={s.grow}><Text style={s.rowTitle}>{installedModels === 3 ? 'Model files in place' : 'Set up your local AI'}</Text><Text style={[s.rowDetail, { color: c.forest2 }]}>{installedModels} of 3 files on {preview ? 'this computer' : 'this device'}. Run a test answer before field use.</Text></View></View>
    <View style={styles.panel}><Text style={s.sectionTitle}>Your farm</Text><Input label="Farm name" accessibilityLabel="Farm name" value={farmDraft} onChangeText={setFarmDraft} placeholder={farmName} maxLength={80} editable={!locked} /><Button label="Save farm name" icon="check" variant="secondary" disabled={locked || !farmDraft.trim()} onPress={() => { void action(async () => { await setSetting('farmName', farmDraft.trim()); setFarmName(farmDraft.trim()); }); }} /></View>
    <Disclosure title="On-device AI" detail="Text guidance and photo model files" icon="device">
      <Text style={s.body}>Model files are kept locally. The app never downloads a missing model or switches to a cloud provider.</Text>
      {(['text', 'vision', 'projection'] as ModelSlot[]).map(slot => <View key={slot} style={styles.modelRow}><View style={styles.modelHeading}><Icon name={models[slot]?.bytes === expectedModelBytes[slot] ? 'check' : 'info'} color={models[slot]?.bytes === expectedModelBytes[slot] ? c.forest2 : c.warning} size={19} /><Text style={s.rowTitle}>{slot === 'text' ? 'Text guidance' : slot === 'vision' ? 'Photo observations' : 'Matching photo adapter'}</Text></View><Text style={s.caption}>{models[slot] ? `${models[slot]!.name} · ${(models[slot]!.bytes / 1e6).toFixed(0)} MB · ${models[slot]!.bytes === expectedModelBytes[slot] ? 'file present' : 'incomplete or unexpected file'}` : 'Not installed'}</Text>{Platform.OS !== 'web' && <Button label={'Choose ' + slot + ' GGUF'} icon="folder" variant="secondary" disabled={locked} onPress={() => { void action(async () => { await importModel(slot); setModels(modelState()); }); }} />}</View>)}
      <Button label={preview ? 'Refresh computer models' : 'Refresh files copied by USB'} icon="folder" variant="secondary" disabled={locked} onPress={() => { void action(async () => setModels(await refreshModels())); }} />
      <Text style={s.caption}>Text: Qwen3-4B-Instruct-2507, experimental local Q3_K_M copy. Photos: VisionPsy-Nano-460M-Flash with its matching Flash Q8 adapter. Do not mix Base and Flash files. A file being present does not establish answer accuracy or memory compatibility.</Text>
    </Disclosure>
    <Disclosure title="Storage on this device" detail="Records, guides and conversations" icon="shield"><Text style={s.body}>This is one local farm profile. Saved records, conversations and reference notes stay in this app’s storage. They are independent of the DairyOS website and other devices.</Text><Text style={s.body}>Selected photos are processed locally in temporary storage. Conversations keep text, not a permanent image copy. Originals stay in Photos. Device backups may include local app data.</Text></Disclosure>
    <Disclosure title="Airplane-mode acceptance check" detail="Check your app before field use" icon="check"><View style={styles.steps}>{['Close and reopen the app with Wi-Fi and cellular data off.', 'Open a saved guide. Add a measured milk or feed entry and check its date and total.', 'Ask a short question in English. Try a clear farm photo and check the observations yourself.', 'Restart the app and confirm that your records remain.'].map((step, index) => <View key={step} style={styles.step}><Text style={styles.stepNumber}>{index + 1}</Text><Text style={[s.body, s.grow]}>{step}</Text></View>)}</View></Disclosure>
    <Disclosure title="About this pilot" detail="Language, limits and app renewal" icon="info"><Text style={s.body}>Generated guidance is in English. Kiswahili keyword search is available in Library; generated Kiswahili guidance has not passed validation. Photo observations may be wrong and cannot establish a diagnosis.</Text><Text style={s.body}>Ask can read nearby BLE sensors and send clear bulb requests directly. Devices also provides manual controls. Server sync and background automation are not enabled.</Text><Text style={s.body}>Use the existing Personal Team for testing and renew weekly. Reinstall the same app without uninstalling to keep local records, notes and models. iOS may need a connection to verify a newly signed build before offline use.</Text></Disclosure>
    <Disclosure title="Device test details" detail="Last answer timing and runtime" icon="clock"><Text selectable style={s.body}>{phoneShell ? 'iPhone · native QVAC runtime' : preview ? 'Computer browser preview' : `${Device.modelName ?? 'Unknown device'} · ${Device.osName ?? 'iOS'} ${Device.osVersion ?? '?'}`}{'\n'}{metrics}</Text><Text style={s.caption}>Timing includes loading. Peak memory, prolonged heat and battery behavior require separate hardware checks.</Text></Disclosure>
  </>;

  return <SafeAreaProvider><SafeAreaView style={styles.safe}><View nativeID="dairyos-app" style={[styles.appShell, desktop && styles.appShellWide]}>
    {desktop && <View nativeID="dairyos-sidebar" style={styles.sidebar}><Logo reverse width={185} /><Text style={styles.sidebarKicker}>LOCAL FARM ASSISTANT</Text><Pressable accessibilityRole="button" accessibilityLabel="Edit farm name" onPress={() => setTab('Setup')} style={styles.farmSwitcher}><Icon name="leaf" size={23} color={c.lime} /><View style={s.grow}><Text style={styles.sidebarFarm}>{farmName}</Text><Text style={styles.sidebarCaption}>Saved on this device</Text></View><Icon name="chevron" size={15} color={c.onForest} /></Pressable><Navigation active={tab} onChange={setTab} desktop /><View style={styles.sidebarFooter}><Icon name="shield" size={18} color={c.onForest} /><Text style={styles.sidebarCaption}>Records and guides, saved locally.</Text></View></View>}
    <View style={styles.main}>
      <View style={[styles.header, desktop && styles.headerWide]}>{desktop ? <View style={styles.headerContext}><Text style={styles.headerFarm}>{farmName}</Text><Text style={s.caption}>/ {tab === 'Ask' ? 'Local assistant' : tab}</Text></View> : <Logo width={150} />}<View style={styles.headerRight}>{preview && desktop && <Text style={styles.previewLabel}>Desktop preview</Text>}<Badge /></View></View>
      {phoneShell && <Pressable accessibilityRole="button" accessibilityLabel="View board connection" onPress={() => setTab('Devices')} style={{ paddingHorizontal: 20, paddingVertical: 8 }}><Text style={s.caption}>{boardPresence(ble)}</Text></Pressable>}
      {!desktop && preview && <View style={styles.previewStrip}><Text style={styles.previewLabel}>Desktop preview · data stays in this browser</Text></View>}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView nativeID="dairyos-chat-scroll" ref={scroll} key={tab} style={styles.flex} contentContainerStyle={[styles.content, desktop && styles.contentWide]} keyboardShouldPersistTaps="handled" onContentSizeChange={() => { if (tab === 'Ask') revealLatest(); }} onLayout={() => { if (tab === 'Ask') revealLatest(); }} onTouchStart={() => { followLatest.current = false; }} onScrollBeginDrag={() => { followLatest.current = false; }} onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; if (contentSize.height - contentOffset.y - layoutMeasurement.height < 60) followLatest.current = true; }} scrollEventThrottle={100}>
          {tab !== 'Ask' && failureNotice}
          {!loaded && !failure && <View style={styles.busyLine}><ActivityIndicator color={c.forest2} /><Text style={s.caption}>Opening local storage…</Text></View>}
          {tab === 'Ask' && <View style={[styles.askLayout, desktop && styles.columns]}><View style={styles.chatColumn}>
            <Heading eyebrow={dateHeading} title="Your farm, at hand." subtitle="Ask about your farm, check a record or add a photo." wide={desktop} />
            {!textReady && <View style={styles.setupNotice}><Icon name="info" color={c.warning} /><Text style={[s.caption, s.grow]}>Add model files in Setup to use AI. Records and the library already work.</Text><Button label="Open Setup" icon="arrow" iconOnly variant="ghost" onPress={() => setTab('Setup')} /></View>}
            {!desktop && !turns.length && !submitted && <TodaySummary records={records} onOpen={() => setTab('Records')} />}
            {!turns.length && !submitted && <PromptList disabled={locked} onChoose={setQuestion} />}
            {(turns.length > 0 || submitted) && <View style={styles.sectionBar}><Text style={s.sectionTitle}>Conversation</Text><Button label="Clear conversation" icon="trash" variant="ghost" disabled={locked} onPress={confirmClear} /></View>}
            {turns.map(turn => <ConversationTurn key={turn.id} turn={turn} />)}
            {submitted && <View nativeID="dairyos-pending-request" style={s.questionBubble}>{submitted.photo && <Text style={s.questionMeta}>Farm photo attached</Text>}<Text selectable style={s.questionText}>{submitted.text}</Text></View>}
            {busy && submitted && <View nativeID="dairyos-processing" accessibilityState={{ busy: true }} style={styles.busyAnswer}><View style={styles.busyLine}><ActivityIndicator color={c.forest2} /><Text accessibilityLiveRegion="polite" style={s.rowTitle}>{friendlyStatus}</Text></View><Text style={s.caption}>Working on this iPhone · {elapsedSeconds}s</Text>{!!answer && <Text nativeID="dairyos-streaming-reply" selectable style={s.body}>{answer}</Text>}</View>}
            {failureNotice}
          </View>{desktop && <View style={styles.contextColumn}><TodaySummary records={records} onOpen={() => setTab('Records')} /><View style={styles.contextNote}><Icon name="shield" size={25} color={c.forest2} /><Text style={styles.contextTitle}>Available without a connection.</Text><Text style={s.caption}>Your saved records, local guides and AI are here when there is no signal.</Text><Text style={s.caption}>English pilot. Check photo observations before acting.</Text></View></View>}</View>}
          {tab === 'Records' && renderRecords()}
          {tab === 'Library' && renderLibrary()}
          {tab === 'Devices' && <Devices />}
          {tab === 'Setup' && renderSetup()}
        </ScrollView>
        {tab === 'Ask' && <View nativeID="dairyos-composer" style={[styles.composerShell, desktop && styles.composerShellWide]}><View style={[styles.composer, desktop && styles.composerWide]}>
          {photo && !busy && <View style={styles.attachment}><Image source={{ uri: photo }} style={styles.thumbnail} accessibilityLabel="Selected farm photo" /><View style={s.grow}><Text style={s.rowTitle}>Farm photo attached</Text><Text style={s.caption}>Processed locally. Observations can be mistaken.</Text></View><Button label="Remove photo" icon="close" iconOnly variant="ghost" disabled={locked} onPress={removePhoto} /></View>}
          <Input accessibilityLabel="Farm question" placeholder="What would you like to know?" multiline value={question} onChangeText={setQuestion} maxLength={1500} editable={!locked} style={styles.questionInput} />
          <View style={styles.composerTools}><View style={styles.attachTools}><Button label="Choose photo" icon="image" iconOnly={width < 420} variant="ghost" disabled={locked} onPress={() => { void action(() => selectPhoto(false)); }} /><Button label="Camera" icon="camera" iconOnly={width < 420} variant="ghost" disabled={locked} onPress={() => { void action(() => selectPhoto(true)); }} /></View>{sendingBulb ? <Button label="Sending command…" disabled variant="secondary" onPress={() => {}} /> : busy ? <Button label="Stop answer" icon="stop" variant="secondary" onPress={() => { void stopInference().catch(error => setFailure(errorText(error))); }} /> : <Button label={photo ? 'Ask about this photo' : 'Ask DairyOS'} displayLabel={photo ? 'Ask photo' : undefined} icon="send" disabled={locked || (!question.trim() && !photo)} onPress={() => { void send(); }} />}</View>
          <Text style={[styles.composerHint, busy && { fontSize: 13, fontWeight: '600', color: c.forest }]}>{working ? 'Working with local files…' : busy ? `${friendlyStatus} · ${elapsedSeconds}s` : 'Clear bulb commands are sent directly. I’ll ask if anything is unclear.'}</Text>
        </View></View>}
      </KeyboardAvoidingView>
      {!desktop && <Navigation active={tab} onChange={setTab} />}

    </View>
  </View></SafeAreaView></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.cream }, flex: { flex: 1, minHeight: 0 }, appShell: { flex: 1, minHeight: 0 }, appShellWide: { flexDirection: 'row' }, main: { flex: 1, minWidth: 0, minHeight: 0 },
  sidebar: { width: 246, backgroundColor: c.forest, padding: 24, paddingTop: 32 }, sidebarKicker: { fontSize: 10, letterSpacing: 1.4, color: c.onForest, marginTop: 16, marginBottom: 28 }, farmSwitcher: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 86, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.forestLine, marginBottom: 24 }, sidebarFarm: { fontSize: 15, fontWeight: '600', color: c.white }, sidebarCaption: { fontSize: 11, lineHeight: 18, color: c.onForest, marginTop: 3 }, sidebarFooter: { marginTop: 'auto', paddingTop: 24, flexDirection: 'row', alignItems: 'center', gap: 9 },
  header: { minHeight: 76, paddingHorizontal: 20, paddingVertical: 15, backgroundColor: c.white, borderBottomWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, headerWide: { minHeight: 84, paddingHorizontal: 32 }, headerContext: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }, headerFarm: { color: c.forest, fontSize: 14, fontWeight: '600', flexShrink: 1 }, headerRight: { flexDirection: 'row', alignItems: 'center', gap: 18 }, previewLabel: { fontSize: 11, color: c.muted }, previewStrip: { minHeight: 27, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderColor: c.line },
  content: { padding: 20, paddingTop: 25, paddingBottom: 28, gap: 20, width: '100%', maxWidth: 1250, alignSelf: 'center', flexGrow: 1 }, contentWide: { padding: 32, paddingTop: 36, gap: 24 }, columns: { flexDirection: 'row', alignItems: 'flex-start' }, askLayout: { gap: 28, flex: 1 }, chatColumn: { flex: 1, minWidth: 0, gap: 24 }, contextColumn: { width: 270, gap: 26 }, contextNote: { gap: 15, paddingTop: 10, paddingBottom: 24, borderBottomWidth: 1, borderColor: c.line }, contextTitle: { fontSize: 18, lineHeight: 25, color: c.forest, fontWeight: '600' },
  composerShell: { backgroundColor: c.white, borderTopWidth: 1, borderColor: c.line }, composerShellWide: { backgroundColor: c.cream, borderTopWidth: 0, paddingHorizontal: 32, paddingBottom: 24 }, composer: { paddingHorizontal: 16, paddingTop: 13, paddingBottom: 10, width: '100%', maxWidth: 1186, alignSelf: 'center', gap: 6 }, composerWide: { borderWidth: 1, borderColor: c.line, borderRadius: 13, backgroundColor: c.white, padding: 18 }, questionInput: { minHeight: 66, maxHeight: 160 }, composerTools: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, attachTools: { flexDirection: 'row', alignItems: 'center', gap: 0 }, composerHint: { fontSize: 11, lineHeight: 17, color: c.muted, marginTop: 2 }, attachment: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 8 }, thumbnail: { width: 64, height: 64, resizeMode: 'cover', borderRadius: 9, backgroundColor: c.sage },
  panel: { padding: 20, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 13, gap: 16, minWidth: 0 }, row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }, recordsLayout: { gap: 24 }, recordForm: { width: '100%', minWidth: 0 }, entryColumn: { width: '100%', gap: 12, minWidth: 0 }, sectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  segments: { flexDirection: 'row', backgroundColor: c.cream, borderWidth: 1, borderColor: c.line, borderRadius: 9, padding: 3, gap: 3 }, segment: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 3, borderWidth: 1, borderColor: 'transparent', borderRadius: 7 }, segmentSelected: { backgroundColor: c.white, borderColor: c.line }, segmentText: { fontSize: 12, color: c.muted, flexShrink: 1 },
  entry: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 14 }, entryHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 }, entryAmount: { color: c.forest, fontSize: 18, lineHeight: 25, fontWeight: '600', flexShrink: 1 }, entryNote: { paddingTop: 12, marginTop: 12, borderTopWidth: 1, borderColor: c.line }, emptyState: { paddingVertical: 28, paddingHorizontal: 22, gap: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: c.controlBorder, borderRadius: 12, alignItems: 'flex-start' }, emptyIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: c.sage }, emptyTitle: { fontSize: 18, lineHeight: 25, color: c.forest, fontWeight: '600' },
  filterScroll: { flexGrow: 0 }, filters: { flexDirection: 'row', gap: 7, paddingVertical: 1 }, filter: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 24 }, filterActive: { backgroundColor: c.forest }, filterText: { fontSize: 13, color: c.muted }, guideGrid: { gap: 14 }, guideGridWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }, guideCell: { minWidth: 0, gap: 5 }, guideCellWide: { width: '48.5%', flexGrow: 1, maxWidth: '50%' },
  readiness: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.sage, borderWidth: 1, borderColor: '#C5DBC8', borderRadius: 12, padding: 19 }, readinessWarning: { backgroundColor: c.warningBg, borderColor: '#D8C69C' }, modelRow: { gap: 8, paddingVertical: 14, borderBottomWidth: 1, borderColor: c.line }, modelHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, steps: { gap: 16 }, step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, stepNumber: { fontSize: 13, lineHeight: 25, fontWeight: '700', color: c.forest2, width: 24, height: 26, textAlign: 'center', backgroundColor: c.sage, borderRadius: 7 },
  setupNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 5, paddingVertical: 8, borderWidth: 1, borderColor: '#D8C69C', borderRadius: 10, backgroundColor: c.warningBg }, error: { borderWidth: 1, borderColor: '#DFB6AE', borderRadius: 12, padding: 16, backgroundColor: c.dangerBg, gap: 8 }, errorHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 }, errorTitle: { color: c.danger, fontSize: 15, lineHeight: 22, fontWeight: '700', flex: 1 }, busyLine: { flexDirection: 'row', alignItems: 'center', gap: 11 }, busyAnswer: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 13, padding: 20, gap: 16 },
});
