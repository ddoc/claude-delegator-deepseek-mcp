import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {callModel} from '../src/client.mjs';

test('one client preserves JSON, vision, grounding and repository conversations', async t => {
  let received;
  let response = {choices: [{finish_reason: 'stop', message: {content: '{"ok":true}', provider_specific_fields: {grounding_metadata: {groundingChunks: [{web: {uri: 'https://example.org'}}]}}}}], usage: {total_tokens: 13, completion_tokens_details: {reasoning_tokens: 3}}};
  const server = createServer(async (req,res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received = JSON.parse(body);
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(response));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const options = {provider: {id:'fixture', api_endpoint:`http://127.0.0.1:${server.address().port}/v1`}, model:{id:'fixture'}, apiKey:'synthetic-fixture-key'};
  const messages = [{role:'user',content:[{type:'text',text:'What color?'},{type:'image_url',image_url:{url:'data:image/png;base64,AA=='}}]}, {role:'assistant',content:'{"action":"read","path":"fixture.txt"}'}, {role:'user',content:'{"ok":true,"result":"blue"}'}];
  const result = await callModel({...options, messages, responseFormat:{type:'json_object'}, tools:[{googleSearch:{}}]});
  assert.deepEqual(received.messages, messages);
  assert.deepEqual(received.response_format, {type:'json_object'});
  assert.deepEqual(received.tools, [{googleSearch:{}}]);
  assert.equal(result.rawUsage.completion_tokens_details.reasoning_tokens,3);
  assert.equal(result.grounding.groundingChunks[0].web.uri,'https://example.org');
  assert.deepEqual(result.response,response);
  response.choices[0].message.content = 'invalid JSON';
  await assert.rejects(callModel({...options,prompt:'JSON please',responseFormat:{type:'json_object'}}));
  response.choices[0].message.content = '{}';response.choices[0].finish_reason = 'length';
  await assert.rejects(callModel({...options,prompt:'JSON please',responseFormat:{type:'json_object'}}));
  await assert.rejects(callModel({...options,messages:[]}));
});
