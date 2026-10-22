import { parsePath, getByPath, hasPath, formatPath, appendSegment } from '../lib/pathResolver';

let pass = 0, fail = 0;
const eq = (label: string, actual: any, expected: any) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; } else { fail++; console.log(`  FAIL ${label}\n       got ${a}\n       want ${e}`); }
};

const rows = [
  { 'Project Name':'Marketing_ssss','Task Name':'Market Research','Assigned to':'Alice','Progress':'78%' },
  { 'Project Name':'m','Task Name':'s','Assigned to':'a','Progress':'w' },
  { 'Project Name':'Product Dev','Task Name':'Prototype Development','Assigned to':'Ethan','Progress':'100%' },
];
const scope: any = {
  previous: { data: { sheetName:'ProjectManagementData', headers:['Project Name','Task Name'], data: rows, totalRows: 51 } },
  steps: { 'Read Sheet': { data: { data: rows } } },
  weird: { "O'Brien": 'apostrophe', 'a.b': 'dotted key', 'x[1]': 'bracket key', first: 'real first prop' },
};

console.log('--- parsePath grammar ---');
eq('dot', parsePath('a.b.c'), ['a','b','c']);
eq('bracket index', parsePath('a[0].b'), ['a','0','b']);
eq('single quote', parsePath("a['Task Name']"), ['a','Task Name']);
eq('double quote', parsePath('a["Task Name"]'), ['a','Task Name']);
eq('backtick', parsePath('a[`Task Name`]'), ['a','Task Name']);
eq('negative index', parsePath('a[-1]'), ['a','-1']);
eq('unquoted space', parsePath('a.Task Name'), ['a','Task Name']);
eq('escaped quote', parsePath("a['O\\'Brien']"), ['a',"O'Brien"]);
eq('dotted quoted key', parsePath("a['a.b']"), ['a','a.b']);
eq('chained brackets', parsePath("a[0]['x'][1]"), ['a','0','x','1']);
eq('spaces in brackets', parsePath("a[ 0 ]"), ['a','0']);
eq('empty', parsePath(''), []);
eq('unterminated bracket', parsePath('a[0'), ['a','0']);
eq('unterminated quote', parsePath("a['Task"), ['a','Task']);

console.log('--- the exact tokens the user reported ---');
eq("previous.data.first['Task Name'] via data.data", getByPath(scope, "previous.data.data.first['Task Name']"), 'Market Research');
eq("previous.data.data[0]['Task Name']", getByPath(scope, "previous.data.data[0]['Task Name']"), 'Market Research');
eq('previous.data.data[0].Task Name', getByPath(scope, 'previous.data.data[0].Task Name'), 'Market Research');
eq('previous.data.data.first.Task Name', getByPath(scope, 'previous.data.data.first.Task Name'), 'Market Research');
eq("steps['Read Sheet'].data.data[0]['Assigned to']", getByPath(scope, "steps['Read Sheet'].data.data[0]['Assigned to']"), 'Alice');
eq('steps.Read Sheet.data.data[0][\'Progress\']', getByPath(scope, "steps.Read Sheet.data.data[0]['Progress']"), '78%');

console.log('--- array accessors ---');
eq('last', getByPath(scope, 'previous.data.data.last.Assigned to'), 'Ethan');
eq('negative index', getByPath(scope, "previous.data.data[-1]['Task Name']"), 'Prototype Development');
eq('length', getByPath(scope, 'previous.data.data.length'), 3);
eq('headers[1]', getByPath(scope, 'previous.data.headers[1]'), 'Task Name');
eq('implicit first row', getByPath(scope, "previous.data.data['Task Name']"), 'Market Research');
eq('out of range', getByPath(scope, 'previous.data.data[99].Task Name'), undefined);

console.log('--- edge cases that must NOT regress ---');
eq('real `first` property wins on objects', getByPath(scope, 'weird.first'), 'real first prop');
eq('apostrophe key', getByPath(scope, "weird['O\\'Brien']"), 'apostrophe');
eq('dotted key needs brackets', getByPath(scope, "weird['a.b']"), 'dotted key');
eq('bracket-in-name key', getByPath(scope, "weird['x[1]']"), 'bracket key');
eq('prototype blocked', getByPath(scope, 'previous.constructor.prototype'), undefined);
eq('__proto__ blocked', getByPath(scope, 'previous.__proto__'), undefined);
eq('inherited not resolved', getByPath({ a: Object.create({ inherited: 1 }) }, 'a.inherited'), undefined);

console.log('--- hasPath vs getByPath (fallback-chain semantics) ---');
eq('hasPath true for present-but-undefined', hasPath({ a: { b: undefined } }, 'a.b'), true);
eq('hasPath false for missing', hasPath({ a: {} }, 'a.b'), false);
eq('hasPath empty path', hasPath({}, ''), false);
eq('hasPath on array index', hasPath(scope, 'previous.data.data[2]'), true);

console.log('--- formatPath round-trip ---');
[['a','b'],['a','Task Name'],['a','0','Task Name'],['weird',"O'Brien"],['a','a.b']].forEach((segs) => {
  eq(`roundtrip ${JSON.stringify(segs)}`, parsePath(formatPath(segs as string[])), segs);
});
eq('appendSegment space', appendSegment('data[0]', 'Task Name'), "data[0]['Task Name']");
eq('appendSegment index', appendSegment('data', '0'), 'data[0]');
eq('appendSegment bare', appendSegment('data', 'rows'), 'data.rows');

console.log(`\n${pass} passed, ${fail} failed`);
(globalThis as any).process?.exit?.(fail === 0 ? 0 : 1);
