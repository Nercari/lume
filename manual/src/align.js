// Node-only check: the paste instructions stay aligned with the default method.
// The browser bundle does not import this file. chat-editor pulls in the rubric reader.
import { DEFAULT_METHOD, DOC_TYPES } from '../../chat-editor/src/method.js';
import { ADAPTED_INSTRUCTIONS, DOC_TYPE_OPTIONS } from './prompt.js';

const SOURCE = [
  /facts in the case evidence/i,
  /decisive fact or legal conclusion/i,
  /section order/i,
  /mustAddress/i,
  /Without a requested outcome/i,
  /requested outcome/i,
  /no passage ids/i,
];

if (ADAPTED_INSTRUCTIONS.length !== DEFAULT_METHOD.instructions.length || ADAPTED_INSTRUCTIONS.length !== SOURCE.length) {
  throw new Error('manual prompt drifted from DEFAULT_METHOD.instructions');
}
DEFAULT_METHOD.instructions.forEach((line, index) => {
  if (!SOURCE[index].test(line)) throw new Error(`DEFAULT_METHOD instruction ${index} no longer matches the manual adaptation`);
});

for (const option of DOC_TYPE_OPTIONS) {
  const source = DOC_TYPES[option.id];
  if (!source) throw new Error(`manual doc type ${option.id} is not in the default method`);
  if (source.label !== option.label) throw new Error(`manual label for ${option.id} drifted from the default method`);
  const titles = source.sections.map((section) => section.title);
  if (titles.join('|') !== option.sections.join('|')) throw new Error(`manual sections for ${option.id} drifted from the default method`);
}
