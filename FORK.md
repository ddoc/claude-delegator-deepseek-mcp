# Extended delegator fork

Fork of [fjgbue/claude-delegator-deepseek-mcp](https://github.com/fjgbue/claude-delegator-deepseek-mcp), based on commit `96ee8bbd8fc9a5124cafdc378682b68899259d55`. MIT license and upstream attribution retained.

One OpenAI-compatible client handles plain text, full message histories, image content, JSON response formats, and provider grounding tools. `callModel` accepts `messages`, `responseFormat`, and `tools` in addition to the original prompt interface. Non-streaming responses preserve the complete provider response in `response`, raw token details in `rawUsage`, and supported grounding metadata in `grounding`. Invalid or incomplete structured responses fail. Provider support is required: requesting grounding does not establish that evidence was returned.

The MCP `delegate` tool adds `json_mode`, `images` (HTTPS/data image URLs), `grounding`, and `max_output_tokens`. Structured results include the answer, raw usage, grounding evidence, and model. Existing aliases and ordinary calls remain compatible.

`runRepositoryLoop({prompt, call, execute, maxSteps=24, onStep})` in `src/repository.mjs` implements a bounded list/read/write/finish protocol. `call({messages,step})` returns an action or `{action,usage}`. The loop preserves conversation history and awaits execution and hooks. The host executor owns checkout isolation, path authorization, and validation. Expected refusals use `RepositoryActionError(code)`; provider and unexpected executor failures propagate. Completion returns `{summary,steps,usage}`. No filesystem access or shell execution is built into this loop. The loop is a reusable host API; repository work is exposed over MCP only when a host adapter registers it.

Set `DELEGATOR_TOOL_ADAPTER` to an absolute module URL to supply host-specific `TOOLS` and `handleToolCall` exports. This permits local policy, concurrency limits, observability, and repository execution without another provider client. Without an adapter the upstream tool handler remains the default. This is trusted server configuration, never a model argument.

Run `npm test` for upstream regressions, capability transport fixtures, and edit-loop protocol tests. No provider credentials are needed for these tests. Hosting applications should disable retries or budget them explicitly to avoid unexpected model spend.
