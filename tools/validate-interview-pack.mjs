import fs from 'node:fs';
import path from 'node:path';
import {simulation} from './sim-context.mjs';
const {TL}=simulation();
try {
  for(const input of process.argv.slice(2)) {
    const pack=JSON.parse(fs.readFileSync(path.resolve(input),'utf8'));
    TL.registerInterviewPack(pack);
    console.log('VALID '+input+' ('+pack.id+' v'+pack.version+')');
  }
  console.log(Object.keys(TL.INTERVIEW_QUESTIONS).length+' questions, '+Object.keys(TL.INTERVIEW_POOLS).length+' pools, '+Object.keys(TL.INTERVIEW_PACKS).length+' packs');
} catch(error) {
  console.error(error.message);process.exitCode=1;
}
