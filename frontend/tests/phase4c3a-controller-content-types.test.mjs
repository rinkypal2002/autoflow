
import assert from 'node:assert/strict';
import { auditContentTypeFindings, findMethodEvidence } from '../scripts/lib/phase4c3aContentTypeAudit.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const jsonController = `
@RestController
@RequestMapping("/things")
class ThingController {
  @PostMapping("/create")
  public Object create(@RequestBody ThingRequest request) { return null; }
}
`;
const multipartController = `
@RestController
@RequestMapping("/files")
class FileController {
  @PostMapping(value="/upload", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
  public Object upload(@RequestPart("file") MultipartFile file) { return null; }
}
`;
const siblingController = `
@RestController
@RequestMapping("/api/v1")
class ChatController {
  @PostMapping(value="/chat", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
  public Object chat(@RequestPart("request") String request, @RequestPart MultipartFile file) { return null; }

  @PostMapping(value="/chat", consumes=MediaType.APPLICATION_JSON_VALUE)
  public Object chatJson(@RequestBody ChatRequest request) { return null; }
}
`;

assert.deepEqual(findMethodEvidence(jsonController, 'create').inferredContentTypes, ['application/json']);
assert.deepEqual(findMethodEvidence(multipartController, 'upload').inferredContentTypes, ['multipart/form-data']);
assert.deepEqual(findMethodEvidence(siblingController, 'chatJson').inferredContentTypes, ['application/json']);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase4c3a-'));
fs.mkdirSync(path.join(temp, 'modules/demo'), { recursive: true });
fs.writeFileSync(path.join(temp, 'modules/demo/ThingController.java'), jsonController);
fs.writeFileSync(path.join(temp, 'modules/demo/ChatController.java'), siblingController);

const registry = [
  {
    actionKey: 'demo.create',
    pluginKey: 'demo',
    httpMethod: 'POST',
    contentType: 'multipart/form-data',
    legacyEndpoints: ['/things/create'],
    sourceFile: 'modules/demo/ThingController.java',
    handlerMethod: 'create',
  },
  {
    actionKey: 'ai.chat',
    pluginKey: 'ai',
    httpMethod: 'POST',
    contentType: 'multipart/form-data',
    legacyEndpoints: ['/api/v1/chat'],
    sourceFile: 'modules/demo/ChatController.java',
    handlerMethod: 'chat',
  },
  {
    actionKey: 'ai.chatJson',
    pluginKey: 'ai',
    httpMethod: 'POST',
    contentType: 'application/json',
    legacyEndpoints: ['/api/v1/chat'],
    sourceFile: 'modules/demo/ChatController.java',
    handlerMethod: 'chatJson',
  },
];

const report = {
  findings: [
    {
      id: 'one',
      findingType: 'CONTENT_TYPE_MISMATCH',
      categoryId: 'demo',
      categoryName: 'Demo',
      actionType: 'create',
      actionName: 'Create',
      frontendMethod: 'POST',
      frontendEndpoint: '/things/create',
      frontendContentType: 'application/json',
      actionId: 'demo.create',
    },
    {
      id: 'two',
      findingType: 'CONTENT_TYPE_MISMATCH',
      categoryId: 'ai',
      categoryName: 'AI',
      actionType: 'chat',
      actionName: 'Chat',
      frontendMethod: 'POST',
      frontendEndpoint: '/api/v1/chat',
      frontendContentType: 'application/json',
      actionId: 'ai.chat',
    },
  ],
};

const audit = auditContentTypeFindings({ report, registry, engineRoot: temp });
assert.equal(audit.status, 'success');
assert.equal(audit.summary.inputFindings, 2);
assert.equal(audit.summary.registryMetadataDrift, 1);
assert.equal(audit.summary.matcherFalsePositives, 1);
assert.equal(audit.summary.unresolved, 0);
assert.deepEqual(audit.registryActionKeysToCorrect, ['demo.create']);
assert.equal(audit.databaseWritesPerformed, 0);
assert.equal(audit.frontendSourceChangesPerformed, 0);
assert.equal(audit.engineSourceChangesPerformed, 0);

console.log('Phase 4C.3A controller content-type certification tests: PASS');
console.log('RequestBody JSON inference: verified');
console.log('Multipart inference: verified');
console.log('Sibling descriptor false-positive detection: verified');
console.log('Registry metadata drift classification: verified');
console.log('Source changes and database writes: 0');
