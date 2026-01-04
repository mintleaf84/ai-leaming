
import db from '../src/lib/db';

const rows = db.prepare(`
  SELECT id, content, correct_ratio, most_wrong_answer, external_id 
  FROM questions 
  ORDER BY id DESC 
  LIMIT 5
`).all();

console.log('--- Database Check Result ---');
console.log(JSON.stringify(rows, null, 2));
console.log('-----------------------------');
