// Small JSON Schema subset validator (no dependency). Supports the keywords that the
// schemas in ../schema use. Messages name the path and the rule, never the value,
// so private content does not reach logs.
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);

export function check(schema, value, root = schema, path = '', errors = []) {
  if (schema.$ref) {
    const def = schema.$ref.replace(/^#\/\$defs\//, '');
    return check(root.$defs[def], value, root, path, errors);
  }
  const at = path || '/';
  const t = typeOf(value);
  if (schema.type && !(schema.type === t || (schema.type === 'number' && t === 'integer'))) {
    errors.push(`${at}: must be ${schema.type}`);
    return errors;
  }
  if ('const' in schema && value !== schema.const) errors.push(`${at}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: must be one of ${schema.enum.join(', ')}`);
  if (t === 'string') {
    if (schema.minLength && value.length < schema.minLength) errors.push(`${at}: too short`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
  }
  if ((t === 'integer' || t === 'number')) {
    if ('minimum' in schema && value < schema.minimum) errors.push(`${at}: must be >= ${schema.minimum}`);
    if ('maximum' in schema && value > schema.maximum) errors.push(`${at}: must be <= ${schema.maximum}`);
  }
  if (t === 'array') {
    if (schema.minItems && value.length < schema.minItems) errors.push(`${at}: needs at least ${schema.minItems} items`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errors.push(`${at}: items must be unique`);
    if (schema.items) value.forEach((v, i) => check(schema.items, v, root, `${path}/${i}`, errors));
  }
  if (t === 'object') {
    for (const k of schema.required || []) if (!(k in value)) errors.push(`${at}: missing ${k}`);
    for (const [k, v] of Object.entries(value)) {
      if (schema.properties?.[k]) check(schema.properties[k], v, root, `${path}/${k}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${at}: unknown property ${JSON.stringify(k).slice(0, 40)}`);
    }
  }
  return errors;
}
