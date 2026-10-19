import assert from 'node:assert/strict';
export function completeInterview(TL,S,style='best') {
  let guard=0;
  while(S.pending?.id === 'organization_interview' && guard++ < 10) {
    const a=S.orgApplication, q=a.session.questions[a.session.answers.length];
    const scores=q.options.map(o=>a.session.pool.axes.reduce((s,x)=>s+o.scores[x.id]*x.weight,0));
    const target=style==='worst' ? Math.min(...scores) : Math.max(...scores);
    TL.choose(S,scores.indexOf(target));
  }
  assert.ok(guard <= 10,'interview terminated');
  const result=S.orgInterviewResult;
  if(S.pending?.id === 'organization_interview_result') TL.choose(S,0);
  return result;
}
