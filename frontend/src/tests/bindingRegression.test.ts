import { createExecutionContext } from '../lib/executionContext';
import { evaluateToken } from '../lib/expression';
import { projectBusinessData } from '../lib/carryForward';

let pass = 0, fail = 0;
const check = (label: string, token: string, scope: any, expected: any) => {
  const r = evaluateToken(token, scope);
  const got = r.found ? r.value : undefined;
  if (JSON.stringify(got) === JSON.stringify(expected)) pass++;
  else { fail++; console.log(`  FAIL ${label}: {{${token}}}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(expected)}`); }
};
const scopeFor = (output: any, name = 'Step') => {
  const ctx = createExecutionContext({ workflowId:'w', runId:'r' });
  ctx.recordNodeOutput({ id:'n', name } as any, output);
  return ctx.buildScope({});
};

console.log('--- 1. REST envelope, no key collision (must be unchanged) ---');
const rest = scopeFor({ success:true, statusCode:200, data:{ employeeId:'E101', name:'Umesh', department:'IT' } });
check('business field', 'previous.employeeId', rest, 'E101');
check('technical still bindable', 'previous.statusCode', rest, 200);
check('envelope head gone from root', 'previous.data', rest, undefined);
check('via $business', 'previous.$business.employeeId', rest, 'E101');
check('whole output', 'previous.output.data.name', rest, 'Umesh');

console.log('--- 2. No envelope at all (must be unchanged) ---');
const flat = scopeFor({ employeeId:'E101', rowsAffected:3 });
check('flat field', 'previous.employeeId', flat, 'E101');
check('flat field 2', 'previous.rowsAffected', flat, 3);

console.log('--- 3. Bare array output ---');
const arr = scopeFor([{ id:1, 'Full Name':'Alice' }, { id:2, 'Full Name':'Bob' }]);
check('array index', 'previous.output[1].id', arr, 2);
check('quoted key', "previous.output[0]['Full Name']", arr, 'Alice');
check('first accessor', "previous.output.first['Full Name']", arr, 'Alice');
check('last accessor', "previous.output.last['Full Name']", arr, 'Bob');

console.log('--- 4. Database result shape ---');
const db = scopeFor({ success:true, data:{ rows:[{ order_id:7, total:99.5 }], rowsAffected:1 } });
check('rows array', 'previous.rows[0].order_id', db, 7);
check('rowsAffected', 'previous.rowsAffected', db, 1);
check('numeric', 'previous.rows[0].total', db, 99.5);

console.log('--- 5. HTTP headers must STILL be technical (object form) ---');
const http = scopeFor({ success:true, data:{ id:9, headers:{ 'content-type':'application/json' } } });
const httpProj = projectBusinessData({ success:true, data:{ id:9, headers:{ 'content-type':'application/json' } } });
const httpBusinessPaths = httpProj.fields.map((f: any) => f.path);
if (!httpBusinessPaths.includes('headers')) pass++; else { fail++; console.log('  FAIL object headers leaked into business fields'); }
// HTTP headers are technical, so they were never at the step root. They stay
// reachable through $technical and through the whole raw output.
check('object headers via $technical', "previous.$technical.headers['content-type']", http, 'application/json');
check('object headers via output', "previous.output.data.headers['content-type']", http, 'application/json');

console.log('--- 6. Excel headers array must be BUSINESS ---');
const xl = projectBusinessData({ success:true, data:{ sheetName:'S', headers:['A','B'], data:[{A:1}], totalRows:1 } });
if (xl.fields.map(f=>f.path).includes('headers')) pass++; else { fail++; console.log('  FAIL array headers not offered as business'); }

console.log('--- 7. Non-envelope collision still redirects to $business ---');
const collide = scopeFor({ success:true, message:'ok', data:{ success:'PAID', amount:10 } });
check('raw success wins at root (unchanged)', 'previous.success', collide, true);
check('payload success via $business', 'previous.$business.success', collide, 'PAID');
// `success` is a TECHNICAL key, so it is filtered before the shadow rule runs.
// Use a business-named collision instead.
const collide2 = scopeFor({ status:'HTTP_OK', data:{ status:'Open', ticketId:'T1' } });
check('raw status wins at root', 'previous.status', collide2, 'HTTP_OK');
check('payload status via $business', 'previous.$business.status', collide2, 'Open');
const p2 = projectBusinessData({ status:'HTTP_OK', data:{ status:'Open', ticketId:'T1' } }).fields.map(f=>f.path);
if (p2.includes('$business.status')) pass++; else { fail++; console.log('  FAIL collision not redirected, got: '+JSON.stringify(p2)); }

console.log('--- 8. Every advertised token resolves, across all shapes ---');
[ { success:true, data:{ sheetName:'S', headers:['A','B'], data:[{ 'Task Name':'X','n':1 }], totalRows:1 } },
  { success:true, statusCode:200, data:{ employeeId:'E1', tags:['a','b'] } },
  { success:true, data:{ rows:[{ id:1 }], rowsAffected:1 } },
  { id:1, nested:{ deep:{ 'Odd Key':'v' } } },
].forEach((output, i) => {
  const sc = scopeFor(output);
  projectBusinessData(output).fields.forEach((f: any) => {
    const r = evaluateToken(`previous.${f.path}`, sc);
    if (r.found) pass++;
    else { fail++; console.log(`  FAIL shape ${i}: advertised {{previous.${f.path}}} does not resolve`); }
  });
});

console.log(`\n${pass} passed, ${fail} failed`);
(globalThis as any).process?.exit?.(fail === 0 ? 0 : 1);
