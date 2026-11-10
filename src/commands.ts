import { recordAnswer, type FarmRecord } from './domain';

// Capability boundaries are application behavior, rather than promises made by a model.
// This router never changes a record or sends an equipment command.
export function localReply(question: string, records: FarmRecord[], currentDate: string): { text: string; origin: 'records' | 'local' } | null {
  const q = question.trim();
  if (/^(hi|hello|hey|help|commands|\/help|what can you do|what can i ask)[!?.\s]*$/iu.test(q)) return {
    origin: 'local', text: 'I can check saved milk and feed totals, offer English guidance from the local farm library, and describe a farm photo with uncertainty. Try “Milk today”, “How much feed yesterday?”, or “How do I keep milking clean?” Use Records to save entries and Library to read guidance. Ask “What is the temperature and humidity?”, “turn Bulb 1 on”, or “switch off Bulb 2”. I ask you to confirm before sending a bulb command. Open Devices to connect the nearby board. Live weather and prices are unavailable offline.',
  };
  if (/\b(?:turn|switch)\s+(?:the\s+)?(?:\S+\s+){0,3}(?:on|off)\b|\b(?:start|stop|open|close|activate|deactivate|connect|send)\b.{0,55}\b(?:pump|valve|motor|irrigation|arduino|bluetooth|relay|sprinkler|command)\b|\b(?:pump|valve|motor|relay)\s+(?:on|off)\b/iu.test(q)) return {
    origin: 'local', text: 'No equipment command was sent. Open Devices to connect your DairyOS board and explicitly confirm a timed bulb command. Supported bulb commands can be requested in Ask and require confirmation. Pumps and other equipment are not configured. I can help with saved farm records and local farming guidance.',
  };
  if (/\b(?:weather|forecast|rain tomorrow|market price|current price|live price|price today|latest price)\b/iu.test(q)) return {
    origin: 'local', text: 'I cannot check live weather, forecasts or current market prices offline. No online lookup was made. You can save a dated observation in Records or keep locally collected information in Library.',
  };
  if (/^(?:(?:please|can you|could you)\s+)*(?:save|add|log|record|delete|remove|update|change)\b/iu.test(q)) return {
    origin: 'local', text: 'No farm data was changed. Open Records to save or delete a milk, feed or observation entry with its date, amount and animal or group. Open Library to add or remove guidance notes.',
  };
  const recorded = recordAnswer(q, records, currentDate);
  return recorded === null ? null : { text: recorded, origin: 'records' };
}
