/**
 * Interview scoring: how a set of answers becomes a verdict.
 *
 * Only the rule lives here. The rest of the interview engine is *flow* — opening a
 * decision, recording history, walking the session — which is stateful by nature and
 * stays in the legacy engine. Keeping the scores pure means a balance change is a
 * data edit, and the verdict can be unit-tested without a running simulation.
 */

export interface InterviewAxis {
  readonly id: string;
  readonly weight: number;
  readonly minimum: number;
}

export interface InterviewOption {
  readonly id: string;
  readonly label?: string;
  readonly scores: Readonly<Record<string, number>>;
}

export interface InterviewQuestion {
  readonly id: string;
  readonly kind?: string;
  readonly prompt?: string;
  readonly options: readonly InterviewOption[];
  readonly fromYear?: number | null;
  readonly untilYear?: number | null;
}

export interface InterviewAnswer {
  readonly question: string;
  readonly option: string;
}

export interface InterviewSession {
  readonly axes: readonly InterviewAxis[];
  readonly questions: readonly InterviewQuestion[];
  readonly answers: readonly InterviewAnswer[];
  readonly passScore: number;
  readonly waitlistScore: number;
}

export interface InterviewAxisScore {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly minimum: number;
  readonly weight: number;
}

export type InterviewStatus = 'incomplete' | 'passed' | 'waitlisted' | 'rejected';

export interface InterviewVerdict {
  readonly status: InterviewStatus;
  readonly score?: number;
  readonly axes?: readonly InterviewAxisScore[];
  readonly passScore?: number;
  /** Axes that scored below their minimum; any one of them blocks a pass. */
  readonly gaps?: readonly string[];
}

export type AxisLabels = Readonly<Record<string, string>>;

/** Whether a question's year window includes this year (both bounds optional). */
export function questionAvailable(question: InterviewQuestion, year: number): boolean {
  if (question.fromYear != null && year < question.fromYear) return false;
  if (question.untilYear != null && year > question.untilYear) return false;
  return true;
}

/**
 * Score a finished session.
 *
 * A pass needs both the weighted total and *every* axis above its minimum: the
 * axes model "you must at least be able to answer this part of the job", so a high
 * average cannot compensate for one disqualifying answer.
 */
export function evaluateInterview(
  session: InterviewSession | null | undefined,
  labels: AxisLabels
): InterviewVerdict {
  if (!session || session.answers.length !== session.questions.length) {
    return {status: 'incomplete'};
  }

  const axes: InterviewAxisScore[] = session.axes.map(axis => {
    let total = 0;
    let maximum = 0;
    session.questions.forEach((question, index) => {
      const answer = session.answers[index];
      if (!answer) throw new Error('Interview answer mismatch');
      const option = question.options.find(candidate => candidate.id === answer.option);
      if (!option || answer.question !== question.id) throw new Error('Interview answer mismatch');
      total += option.scores[axis.id] ?? 0;
      maximum += Math.max(...question.options.map(candidate => candidate.scores[axis.id] ?? 0));
    });
    return {
      id: axis.id,
      label: labels[axis.id] ?? axis.id,
      value: maximum === 0 ? 0 : (total / maximum) * 100,
      minimum: axis.minimum,
      weight: axis.weight
    };
  });

  const score = axes.reduce((sum, axis) => sum + axis.value * axis.weight, 0);
  const gaps = axes.filter(axis => axis.value < axis.minimum);
  const status: InterviewStatus = score >= session.passScore && gaps.length === 0
    ? 'passed'
    : score >= session.waitlistScore ? 'waitlisted' : 'rejected';

  return {status, score, axes, passScore: session.passScore, gaps: gaps.map(axis => axis.id)};
}
type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;

/**
 * Read a session out of its stored shape.
 *
 * The engine keeps the axes, pass and waitlist scores on `session.pool` (the snapshot
 * of the question pool taken at interview time), so the same numbers appear in two
 * places depending on who built the object. Normalising here keeps the rule unaware.
 */
export function interviewSession(source: unknown): InterviewSession | null {
  const session = record(source);
  if (!session) return null;
  const pool = record(session.pool) ?? {};
  const axes = Array.isArray(session.axes) ? session.axes : pool.axes;
  const questions = session.questions;
  const answers = session.answers;
  if (!Array.isArray(axes) || !Array.isArray(questions) || !Array.isArray(answers)) return null;
  return {
    axes: axes as InterviewAxis[],
    questions: questions as InterviewQuestion[],
    answers: answers as InterviewAnswer[],
    passScore: Number(session.passScore ?? pool.passScore ?? 0),
    waitlistScore: Number(session.waitlistScore ?? pool.waitlistScore ?? 0)
  };
}