import type { Reference } from '../src/domain';

// Brief original summaries; the source URLs identify provenance, not a runtime dependency.
// This small starter pack requires local agronomic review before field deployment.
export const starterLibrary: Reference[] = [
  {
    id: 'fao-dairy-hygiene', title: 'Clean milking routines',
    source: 'https://www.fao.org/4/ba0027e/ba0027e00.pdf', section: 'FAO/IDF 2011, section 2.2',
    keywords: ['milk', 'milking', 'hygiene', 'clean', 'maziwa', 'kukamua', 'usafi'],
    text: 'Keep animal resting areas and milking areas clean and well drained. Maintain dry, clean bedding. Milkers should use clean clothing and hands and cover cuts. Clean milking equipment after each milking and before reuse; use suitable water and follow approved cleaning-product instructions. Keep cleaning chemicals away from stored milk. These practices reduce contamination risk but do not diagnose udder disease.'
  },
  {
    id: 'fao-dairy-feed', title: 'Feed and water management',
    source: 'https://www.fao.org/dairy-production-products/production/farm-practices/', section: 'FAO, farm practices: nutrition',
    keywords: ['feed', 'water', 'feeding', 'storage', 'mould', 'mold', 'maji', 'chakula', 'malisho'],
    text: 'Plan reliable feed and water supplies with appropriate quality and quantity. Check feed storage conditions and keep track of feed brought onto the farm. Record changes in feed supply and intake. This general guide supplies no animal-specific ration or chemical rate; those require additional animal and feed information.'
  },
  {
    id: 'fao-poultry-housing', title: 'Poultry housing and drinking water',
    source: 'https://www.fao.org/4/y5169e/y5169e05.htm', section: 'FAO small-scale poultry production, chapter 4: housing',
    keywords: ['poultry', 'chicken', 'chickens', 'house', 'housing', 'ventilation', 'heat', 'water', 'kuku', 'banda', 'joto', 'maji'],
    text: 'Provide clean drinking water and housing that allows air movement around the birds. Housing design must suit the climate, available space and production system. Good shelter and drainage matter. Inspect actual house conditions before changing ventilation or stocking arrangements; this starter note does not specify stocking densities or temperature targets.'
  },
  {
    id: 'csu-crop-inspection', title: 'Inspecting a crop problem before treatment',
    source: 'https://extension.colostate.edu/resource/diagnosing-plant-disorders/', section: 'CSU Extension, diagnostic information and steps 1–2',
    keywords: ['crop', 'plant', 'leaf', 'leaves', 'tomato', 'maize', 'yellow', 'spot', 'wilting', 'damage', 'mmea', 'mimea', 'jani', 'majani', 'nyanya', 'mahindi', 'ugonjwa'],
    text: 'Confirm the crop identity first. Record when symptoms began, how they progressed, and which plants or plant parts are affected. Inspect the whole plant and its surroundings, not only one leaf. Take both whole-plant and close-up pictures. Ask about watering, site history and recent changes. Similar symptoms can have different causes; a general description or a single leaf photo is insufficient for a confident diagnosis. Identify the cause before selecting a treatment.'
  },
  {
    id: 'fao-crop-monitoring', title: 'Observe crop growth, insects and field conditions',
    source: 'https://www.fao.org/agriculture/ippm/programme/ffs-approach/en/', section: 'FAO farmer field school approach: field observation',
    keywords: ['crop', 'plants', 'growth', 'insects', 'pests', 'weeds', 'soil', 'field', 'mimea', 'wadudu', 'magugu', 'udongo', 'shamba'],
    text: 'Regular field observations help farmers compare plant development, insects, weeds, affected plants, soil conditions and water management. Keep observations over time and discuss them with a trained extension facilitator where available. Compare practices rather than assuming a new method is better. This observation approach does not supply a crop-specific pesticide, fertilizer or planting rate.'
  },
  {
    id: 'fao-animal-observation', title: 'Observe livestock health and separate sick animals',
    source: 'https://www.fao.org/4/t0690e/t0690e04.htm', section: 'FAO primary animal health care, units 5–6',
    keywords: ['animal', 'livestock', 'cow', 'cattle', 'goat', 'sheep', 'sick', 'health', 'appetite', 'breathing', 'ngombe', 'mbuzi', 'kondoo', 'mnyama', 'wagonjwa', 'afya'],
    text: 'Compare an animal with its usual behavior and with healthy animals of the same kind. Observe appetite, movement, breathing, appearance and whether it stays apart from the group. Record changes and when they began. Keep sick animals separate from healthy animals where this can be done safely, with clean feed, drinking water, bedding and shelter. Observations support a health assessment; they do not identify the disease or determine a drug treatment.'
  },
];
