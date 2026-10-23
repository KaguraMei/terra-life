/**
 * Loading a question-pack document.
 *
 * DLC packs arrive as JSON authored outside this repository. The single source
 * of truth for what a valid pack *is* stays the model registry validator; this
 * module only turns a document into "call register for each pack, collect what
 * went wrong, never leave the registry half-updated".
 *
 * Two document shapes are accepted, because both appear in the wild:
 *   - one pack object            `{id, version, schemaVersion, ..., questions, pools}`
 *   - a bundle                   `{packs: [pack, ...]}` or a bare array
 */
import type {ContentDiagnostic} from './registry-validation';

export interface PackLoadResult {
  readonly registered: string[];
  readonly diagnostics: ContentDiagnostic[];
}

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord : null;

/** Pull the pack objects out of a document without validating their contents. */
export function packDocumentEntries(input: unknown): {packs: unknown[]; diagnostics: ContentDiagnostic[]} {
  const diagnostics: ContentDiagnostic[] = [];
  let document = input;

  if (typeof document === 'string') {
    try {
      document = JSON.parse(document);
    } catch (error) {
      diagnostics.push({
        code: 'pack.json-invalid', path: '',
        message: `the pack document is not valid JSON: ${(error as Error).message}`
      });
      return {packs: [], diagnostics};
    }
  }

  if (Array.isArray(document)) return {packs: document, diagnostics};
  const source = record(document);
  if (!source) {
    diagnostics.push({code: 'pack.not-object', path: '', message: 'a pack document must be an object or an array'});
    return {packs: [], diagnostics};
  }
  if (Array.isArray(source.packs)) return {packs: source.packs, diagnostics};
  if (typeof source.id === 'string') return {packs: [source], diagnostics};
  diagnostics.push({
    code: 'pack.not-object', path: '',
    message: 'a pack document needs either an id (single pack) or a packs array'
  });
  return {packs: [], diagnostics};
}

/**
 * Register every pack in a document.
 *
 * `register` is the model's own registration function: it validates first and
 * throws before mutating anything, so a bad pack cannot leave a partial registry.
 * Failures are reported per pack and the remaining packs are still attempted.
 */
export function loadInterviewPacks(
  input: unknown,
  register: (pack: unknown) => void
): PackLoadResult {
  const {packs, diagnostics} = packDocumentEntries(input);
  const registered: string[] = [];

  packs.forEach((pack, index) => {
    const source = record(pack);
    const id = source && typeof source.id === 'string' ? source.id : `(index ${index})`;
    if (!source) {
      diagnostics.push({code: 'pack.not-object', path: `packs[${index}]`, message: 'a pack must be an object'});
      return;
    }
    try {
      register(source);
      registered.push(id);
    } catch (error) {
      diagnostics.push({
        code: 'pack.invalid', path: `packs[${index}]`,
        message: `${id}: ${(error as Error).message}`
      });
    }
  });

  return {registered, diagnostics};
}
