'use strict';

const {
  sanitizeDefinitionForDatabase,
} = require('../db/filesystemWorkspaceMigration');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = {
  id: 'wf-1',
  icon: undefined,
  actions: [],
  connections: [],
  variables: [
    {
      id: 'normal',
      name: 'NORMAL',
      type: 'string',
      value: 'visible',
    },
    {
      id: 'secret',
      name: 'PASSWORD',
      type: 'string',
      scope: 'secret',
      isSecret: true,
      value: 'must-not-survive',
      defaultValue: 'must-not-survive-either',
    },
  ],
};

const sanitized = sanitizeDefinitionForDatabase(source);

assert(!Object.prototype.hasOwnProperty.call(sanitized, 'icon'), 'Undefined JSON property was not removed.');
assert(sanitized.variables[0].value === 'visible', 'Normal variable was changed.');
assert(sanitized.variables[1].value === null, 'Secret value was not redacted.');
assert(sanitized.variables[1].defaultValue === null, 'Secret default value was not redacted.');
assert(sanitized.variables[1].secretValueRedacted === true, 'Redaction marker is missing.');

console.log('JSON canonicalization  : PASS');
console.log('Secret redaction      : PASS');
console.log('RESULT                : FIX 3 UNIT CHECK PASSED');
