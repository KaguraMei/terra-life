/**
 * Runtime validation for the hand-authored core registries.
 *
 * The core content (nations, races, jobs, organizations, events, timeline,
 * decisions, provenance) is still written as plain JS objects. This module is
 * the contract those objects must satisfy before a simulation may start.
 *
 * Two rules keep it useful as the content grows:
 *  1. every diagnostic has a stable `code` and a dotted `path`, so tests can
 *     assert the *kind* of failure instead of matching prose;
 *  2. checks describe referential and range relations only. They never
 *     recompute a salary or a probability, so tuning content does not require
 *     touching the validator.
 *
 * JSON Schema files under `schemas/` remain the editor-facing description; this
 * module is the executable side and is intentionally dependency-free.
 */

export interface ContentDiagnostic {
  /** Stable machine identity, e.g. `event.invalid-weight`. */
  readonly code: string;
  /** Dotted content path, e.g. `events.quiet_year.w`. */
  readonly path: string;
  readonly message: string;
}

type UnknownRecord = Record<string, unknown>;
type Candidate = UnknownRecord;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function entries(value: unknown): Array<[string, Candidate]> {
  const bag = record(value);
  if (!bag) return [];
  const result: Array<[string, Candidate]> = [];
  for (const [key, item] of Object.entries(bag)) {
    const row = record(item);
    if (row) result.push([key, row]);
  }
  return result;
}

function list(value: unknown): Candidate[] {
  return Array.isArray(value)
    ? value.map(record).filter((row): row is Candidate => row !== null)
    : [];
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;
const isProbability = (value: unknown): boolean =>
  isFiniteNumber(value) && value >= 0 && value <= 1;

class Diagnostics {
  readonly items: ContentDiagnostic[] = [];

  fail(code: string, path: string, message: string): void {
    this.items.push({ code, path, message });
  }

  /** Fail unless `condition` holds. */
  require(condition: unknown, code: string, path: string, message: string): void {
    if (!condition) this.fail(code, path, message);
  }
}

/**
 * Validate ID uniqueness for a domain and return the set of known IDs. Missing
 * or blank IDs are reported but not added, so downstream reference checks do not
 * produce a misleading "unknown ID" cascade.
 */
function uniqueIds(diagnostics: Diagnostics, domain: string, items: Candidate[]): Set<string> {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    const id = item.id;
    if (!isNonEmptyString(id)) {
      diagnostics.fail('id.missing', `${domain}[${index}].id`, `${domain}: missing ID`);
      continue;
    }
    if (seen.has(id)) {
      diagnostics.fail('id.duplicate', `${domain}.${id}`, `${domain}: duplicate ID ${id}`);
      continue;
    }
    seen.add(id);
  }
  return seen;
}

/**
 * Setting evidence and game rules must both be traceable and must stay in
 * separate fields; see docs/注册数据来源与校验.md.
 */
function provenance(diagnostics: Diagnostics, path: string, item: Candidate): void {
  const data = record(item.provenance);
  const setting = record(data?.setting);
  const model = record(data?.gameModel);
  const settingSources = setting?.sources;
  const modelSources = model?.sources;
  const sourcesOk = (value: unknown): boolean =>
    Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);

  if (!setting || !isNonEmptyString(setting.kind) || !isNonEmptyString(setting.confidence) ||
      !sourcesOk(settingSources)) {
    diagnostics.fail('provenance.missing-setting', `${path}.provenance.setting`,
      `${path}: missing traceable setting provenance`);
  }
  if (!model || model.kind !== 'project-rule' || !sourcesOk(modelSources)) {
    diagnostics.fail('provenance.missing-game-rule', `${path}.provenance.gameModel`,
      `${path}: missing separate game-rule provenance`);
  }
}

/** Every content domain that must declare where its facts come from. */
export const PROVENANCE_DOMAINS = [
  'organizations', 'timeline', 'jobs', 'races', 'events', 'nations', 'decisions'
] as const;

function checkProvenanceRegistry(
  diagnostics: Diagnostics,
  value: unknown,
  domains: readonly string[]
): void {
  const registry = record(value);
  if (!registry || registry.version !== 1) {
    diagnostics.fail('provenance.registry-version', 'CONTENT_PROVENANCE.version',
      'provenance registry: unsupported or missing version');
    return;
  }
  for (const domain of domains) {
    const item = record(registry[domain]);
    for (const kind of ['facts', 'inference'] as const) {
      const list = item?.[kind];
      diagnostics.require(Array.isArray(list) && list.length > 0,
        'provenance.missing-domain', `CONTENT_PROVENANCE.${domain}.${kind}`,
        `provenance ${domain}: missing ${kind} references`);
      for (const source of Array.isArray(list) ? list : []) {
        const row = record(source);
        diagnostics.require(isNonEmptyString(row?.source) && isNonEmptyString(row?.scope),
          'provenance.malformed-reference', `CONTENT_PROVENANCE.${domain}.${kind}`,
          `provenance ${domain}: malformed ${kind} reference`);
      }
    }
  }
  // A misspelled domain would otherwise pass silently while its real domain goes
  // unchecked, so anything not in the list is reported.
  for (const key of Object.keys(registry)) {
    if (key === 'version' || domains.includes(key)) continue;
    diagnostics.fail('provenance.unknown-domain', `CONTENT_PROVENANCE.${key}`,
      `provenance domain ${key} is not a known content domain`);
  }
}

function checkIndexSize(diagnostics: Diagnostics, path: string, index: unknown, expected: number): void {
  if (record(index) && Object.keys(index as UnknownRecord).length !== expected) {
    diagnostics.fail('index.size-mismatch', path, `${path}: ID index size differs`);
  }
}

function checkNations(diagnostics: Diagnostics, nations: Candidate[], raceIds: Set<string>): Set<string> {
  const ids = uniqueIds(diagnostics, 'nations', nations);
  for (const nation of nations) {
    const id = isNonEmptyString(nation.id) ? nation.id : '(unknown)';
    provenance(diagnostics, `nation ${id}`, nation);
    for (const raceId of Array.isArray(nation.race) ? nation.race : []) {
      diagnostics.require(raceIds.has(raceId as string), 'reference.unknown-race', `nations.${id}.race`,
        `nation ${id}: unknown race ${String(raceId)}`);
    }
  }
  return ids;
}

function checkRaces(
  diagnostics: Diagnostics,
  races: Candidate[],
  nationIds: Set<string>
): void {
  for (const race of races) {
    const id = isNonEmptyString(race.id) ? race.id : '(unknown)';
    provenance(diagnostics, `race ${id}`, race);
    for (const nationId of Array.isArray(race.where) ? race.where : []) {
      diagnostics.require(nationIds.has(nationId as string), 'reference.unknown-nation', `races.${id}.where`,
        `race ${id}: unknown nation ${String(nationId)}`);
    }
  }
}

function checkOrganizations(
  diagnostics: Diagnostics,
  organizations: unknown,
  nationIds: Set<string>,
  jobIds: Set<string>,
  employmentModels: unknown
): Set<string> {
  const ids = new Set<string>();
  for (const [id, organization] of entries(organizations)) {
    ids.add(id);
    const path = `organization ${id}`;
    provenance(diagnostics, path, organization);

    if (!isFiniteNumber(organization.fromYear)) {
      diagnostics.fail('organization.invalid-window', `organizations.${id}.fromYear`,
        `${path}: missing fromYear`);
    }
    const fromYear = isFiniteNumber(organization.fromYear) ? organization.fromYear : null;
    for (const field of ['untilYear', 'recruitUntil'] as const) {
      const value = organization[field];
      if (value == null) continue;
      diagnostics.require(isFiniteNumber(value) && (fromYear === null || value >= fromYear),
        'organization.invalid-window', `organizations.${id}.${field}`,
        `${path}: invalid ${field} window`);
    }
    diagnostics.require(isNonEmptyString(organization.source),
      'organization.missing-source', `organizations.${id}.source`, `${path}: missing source`);
    diagnostics.require(isNonEmptyString(organization.sourceType) && isNonEmptyString(organization.confidence),
      'organization.missing-classification', `organizations.${id}.sourceType`,
      `${path}: source facts and confidence must be distinguished`);
    diagnostics.require(isNonEmptyString(organization.rulesSource) && isNonEmptyString(organization.yearBasis),
      'organization.missing-rule-source', `organizations.${id}.rulesSource`,
      `${path}: missing game-rule/year provenance`);

    const model = record(employmentModels)?.[organization.employmentModel as string];
    diagnostics.require(!!record(model), 'organization.unknown-employment-model',
      `organizations.${id}.employmentModel`,
      `${path}: unknown employment model ${String(organization.employmentModel)}`);
    for (const nationId of Array.isArray(organization.nations) ? organization.nations : []) {
      diagnostics.require(nationIds.has(nationId as string), 'reference.unknown-nation',
        `organizations.${id}.nations`, `${path}: unknown nation ${String(nationId)}`);
    }

    const contactIds = new Set<string>();
    for (const contact of list(organization.contacts)) {
      const contactId = isNonEmptyString(contact.id) ? contact.id : '(unknown)';
      const contactPath = `organizations.${id}.contacts.${contactId}`;
      if (!isNonEmptyString(contact.id) || !isNonEmptyString(contact.name)) {
        diagnostics.fail('organization.invalid-contact', contactPath, `${path}: invalid contact identity`);
      }
      if (contactIds.has(contactId)) {
        diagnostics.fail('id.duplicate', contactPath, `${path}: duplicate contact ID ${contactId}`);
      }
      contactIds.add(contactId);
      diagnostics.require(isProbability(contact.chance), 'organisation.contact-chance-out-of-range',
        `${contactPath}.chance`, `${path}/${contactId}: chance must be in [0, 1]`);
      if (!(isFiniteNumber(contact.fromYear) && isFiniteNumber(contact.untilYear) && contact.untilYear >= contact.fromYear)) {
        diagnostics.fail('organization.invalid-window', contactPath,
          `${path}/${contactId}: invalid contact window`);
      }
    }

    const routes = entries(organization.routes);
    diagnostics.require(routes.length > 0, 'organization.missing-routes', `organizations.${id}.routes`,
      `${path}: missing routes`);
    for (const [routeId, route] of routes) {
      const routePath = `organizations.${id}.routes.${routeId}`;
      diagnostics.require(isNonEmptyString(route.name), 'organization.route-missing-name',
        `${routePath}.name`, `${path}/${routeId}: missing route name`);
      diagnostics.require(isFiniteNumber(route.minAge) && route.minAge >= 0,
        'organization.route-invalid-age', `${routePath}.minAge`, `${path}/${routeId}: missing minimum age`);
      for (const jobId of Array.isArray(route.jobs) ? route.jobs : []) {
        diagnostics.require(jobIds.has(jobId as string), 'reference.unknown-job', `${routePath}.jobs`,
          `${path}/${routeId}: unknown job ${String(jobId)}`);
      }
      if (route.entryJob != null) {
        diagnostics.require(jobIds.has(route.entryJob as string), 'reference.unknown-job',
          `${routePath}.entryJob`, `${path}/${routeId}: unknown entry job ${String(route.entryJob)}`);
      }
      const ranks = list(route.ranks);
      diagnostics.require(ranks.length > 0, 'organization.route-missing-ranks', `${routePath}.ranks`,
        `${path}/${routeId}: missing ranks`);
      let previous = -1;
      for (const [rank, item] of ranks.entries()) {
        const needYears = item.needYears;
        const valid = isFiniteNumber(needYears) && needYears >= 0 && needYears >= previous;
        diagnostics.require(valid, 'organization.route-invalid-promotion',
          `${routePath}.ranks[${rank}].needYears`,
          `${path}/${routeId}: invalid promotion years at rank ${rank}`);
        previous = valid ? (needYears as number) : previous;
      }
    }
  }
  return ids;
}

function checkJobs(diagnostics: Diagnostics, jobs: unknown, nationIds: Set<string>): Set<string> {
  const ids = new Set<string>();
  for (const [id, job] of entries(jobs)) {
    ids.add(id);
    const path = `job ${id}`;
    provenance(diagnostics, path, job);
    diagnostics.require(isNonEmptyString(job.name), 'job.missing-name', `jobs.${id}.name`, `${path}: missing name`);
    const intervalOk = isFiniteNumber(job.lo) && isFiniteNumber(job.hi) && job.lo >= 0 && job.hi >= job.lo;
    diagnostics.require(intervalOk, 'job.invalid-salary-interval', `jobs.${id}`,
      `${path}: invalid salary interval`);
    const modelOk = ['edu', 'art', 'ori', 'disc'].every(field =>
      isFiniteNumber(job[field]) && (job[field] as number) >= 0);
    diagnostics.require(modelOk, 'job.incomplete-model-fields', `jobs.${id}`, `${path}: incomplete model fields`);
    for (const [cause, multiplier] of Object.entries(record(job.risk) ?? {})) {
      diagnostics.require(isFiniteNumber(multiplier) && multiplier >= 0, 'job.invalid-risk',
        `jobs.${id}.risk.${cause}`, `${path}: invalid risk ${cause}`);
    }
    for (const field of ['only', 'notNations'] as const) {
      for (const nationId of Array.isArray(job[field]) ? job[field] as unknown[] : []) {
        diagnostics.require(nationIds.has(nationId as string), 'reference.unknown-nation',
          `jobs.${id}.${field}`, `${path}: unknown nation ${String(nationId)}`);
      }
    }
  }
  return ids;
}

function checkEvents(
  diagnostics: Diagnostics,
  events: unknown,
  organizationIds: Set<string>
): Set<string> {
  const ids = new Set<string>();
  for (const [id, event] of entries(events)) {
    ids.add(id);
    const path = `event ${id}`;
    provenance(diagnostics, path, event);
    diagnostics.require(event.id === id, 'event.id-mismatch', `events.${id}.id`,
      `${path}: registry key does not match ID`);
    diagnostics.require(isFiniteNumber(event.w) && event.w >= 0, 'event.invalid-weight', `events.${id}.w`,
      `${path}: invalid selection weight`);
    if (event.max != null) {
      diagnostics.require(Number.isInteger(event.max) && (event.max as number) >= 0, 'event.invalid-limit',
        `events.${id}.max`, `${path}: invalid occurrence limit`);
    }
    if (event.cd != null) {
      diagnostics.require(isFiniteNumber(event.cd) && event.cd >= 0, 'event.invalid-cooldown',
        `events.${id}.cd`, `${path}: invalid cooldown`);
    }
    for (const field of ['fromYear', 'untilYear'] as const) {
      const value = event[field];
      if (value == null) continue;
      diagnostics.require(isFiniteNumber(value), 'event.invalid-window', `events.${id}.${field}`,
        `${path}: invalid ${field}`);
    }
    if (event.fromYear != null && event.untilYear != null) {
      diagnostics.require((event.untilYear as number) >= (event.fromYear as number), 'event.invalid-window',
        `events.${id}`, `${path}: reversed year window`);
    }
    if (event.organization != null) {
      diagnostics.require(organizationIds.has(event.organization as string), 'reference.unknown-organization',
        `events.${id}.organization`, `${path}: unknown organization ${String(event.organization)}`);
    }
  }
  return ids;
}

function checkTimeline(diagnostics: Diagnostics, timeline: Candidate[], nationIds: Set<string>): Set<string> {
  const ids = uniqueIds(diagnostics, 'timeline', timeline);
  for (const item of timeline) {
    const id = isNonEmptyString(item.id) ? item.id : '(unknown)';
    const path = `timeline ${id}`;
    provenance(diagnostics, path, item);
    diagnostics.require(Number.isInteger(item.year), 'timeline.invalid-year', `timeline.${id}.year`,
      `${path}: missing or invalid year`);
    const scope = record(item.scope);
    const nations = [...(Array.isArray(scope?.nations) ? scope.nations as unknown[] : []),
      ...Object.keys(record(item.fx) ?? {})];
    for (const nationId of nations) {
      diagnostics.require(nationIds.has(nationId as string), 'reference.unknown-nation',
        `timeline.${id}.scope`, `${path}: unknown nation ${String(nationId)}`);
    }
    for (const personal of list(item.at)) {
      if (personal.die == null) continue;
      diagnostics.require(isProbability(personal.die), 'timeline.invalid-death-probability',
        `timeline.${id}.at.die`, `${path}: death probability must be in [0, 1]`);
    }
  }
  return ids;
}

function checkDecisions(diagnostics: Diagnostics, decisions: unknown): void {
  for (const [id, decision] of entries(decisions)) {
    const path = `decision ${id}`;
    diagnostics.require(isNonEmptyString(decision.title) || typeof decision.title === 'function',
      'decision.missing-title', `decisions.${id}.title`, `${path}: missing title`);
    const optionsValue = decision.options;
    const options = typeof optionsValue === 'function' ? null : list(optionsValue);
    if (options) {
      diagnostics.require(options.length > 0, 'decision.missing-options', `decisions.${id}.options`,
        `${path}: missing options`);
      for (const [index, option] of options.entries()) {
        diagnostics.require(isNonEmptyString(option.label) || typeof option.label === 'function',
          'decision.option-missing-label', `decisions.${id}.options[${index}].label`,
          `${path}: option ${index} has no label`);
        const eff = record(option.eff);
        for (const [field, value] of Object.entries(eff ?? {})) {
          diagnostics.require(isFiniteNumber(value), 'decision.non-finite-effect',
            `decisions.${id}.options[${index}].eff.${field}`,
            `${path}: option ${index} effect ${field} must be a finite number`);
        }
      }
    }
    if (decision.when != null) {
      diagnostics.require(typeof decision.when === 'function', 'decision.invalid-predicate',
        `decisions.${id}.when`, `${path}: when must be a function`);
    }
  }
}

/**
 * Validate the assembled core registries. Returns every diagnostic in a stable
 * order; an empty array means the simulation may start.
 */
export function validateRegistries(registries: unknown): ContentDiagnostic[] {
  const diagnostics = new Diagnostics();
  const root = record(registries);
  if (!root) {
    diagnostics.fail('registry.not-object', '', 'core registries are not an object');
    return diagnostics.items;
  }

  const races = list(root.RACES);
  const raceIds = uniqueIds(diagnostics, 'races', races);
  const nationIds = checkNations(diagnostics, list(root.NATIONS), raceIds);
  checkRaces(diagnostics, races, nationIds);
  const jobIds = checkJobs(diagnostics, root.JOBS, nationIds);
  const organizationIds = checkOrganizations(
    diagnostics, root.ORGANIZATIONS, nationIds, jobIds, root.EMPLOYMENT_MODELS);
  checkEvents(diagnostics, root.EVMAP, organizationIds);
  checkTimeline(diagnostics, list(root.TIMELINE), nationIds);
  checkDecisions(diagnostics, root.DECISIONS);
  checkProvenanceRegistry(diagnostics, root.CONTENT_PROVENANCE, PROVENANCE_DOMAINS);

  checkIndexSize(diagnostics, 'NATION_BY_ID', root.NATION_BY_ID, nationIds.size);
  checkIndexSize(diagnostics, 'RACE_BY_ID', root.RACE_BY_ID, raceIds.size);
  checkIndexSize(diagnostics, 'TL_BY_ID', root.TL_BY_ID, list(root.TIMELINE).length);

  return diagnostics.items;
}

/** Human-readable rendering for start-up failures and CLI output. */
export function formatDiagnostics(diagnostics: readonly ContentDiagnostic[]): string {
  return diagnostics.map(item => `- [${item.code}] ${item.path || '(root)'}: ${item.message}`).join('\n');
}
