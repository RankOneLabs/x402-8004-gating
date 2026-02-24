# CLAUDE.md

## Code Style

Prefer functional pipeline patterns where they improve clarity and composability:

- Default to map/filter/reduce and small, named pure functions that compose into pipelines
- Each function should be independently testable and reusable across flows
- Data should flow through transforms when the logic is naturally a pipeline
- Use plain for loops when they're genuinely clearer — early breaks or side effects
- Prefer Option (Some/None) over null checks — represent absence explicitly in the type system
- Use Result (Ok/Err) for operations that can fail — errors are values, not exceptions
- Define specific error types per domain (e.g., AuthError, ValidationError, NetworkError)
- Error types should carry enough context to debug without reading the implementation
- Reserve throw/try-catch for truly unexpected failures, not business logic
- Roll lightweight project-local implementations rather than importing a library
- Don't force a reduce when a loop reads better

### Preferred: Functional pipeline

Small named functions that compose and can be reused across flows:

```ts
const isEligible = (user) => user.active && user.age >= 18
const toSummary = (user) => ({ name: user.name, region: user.region })
const groupBy = (key) => (acc, item) => ({
  ...acc,
  [item[key]]: [...(acc[item[key]] || []), item],
})

const result = users
  .filter(isEligible)
  .map(toSummary)
  .reduce(groupBy("region"), {})
```

### Avoid: Imperative accumulation

Mutation and conditionals tangled together in a single block:

```ts
const result = {}
for (const user of users) {
  if (user.active && user.age >= 18) {
    const summary = { name: user.name, region: user.region }
    if (!result[user.region]) result[user.region] = []
    result[user.region].push(summary)
  }
}
```

### Acceptable: Loop with side effects

When each iteration performs side effects with early exit on failure, a loop is the right tool:

```ts
const publishAll = async (events) => {
  for (const event of events) {
    const ok = await broker.publish(event)
    if (!ok) throw new PublishError(event.id)
  }
}
```

### Preferred: Async pipelines

Compose async stages rather than nesting try/catch blocks:

```ts
const fetchUser = (id) => api.get(`/users/${id}`)
const enrichWithPosts = async (user) => ({
  ...user,
  posts: await api.get(`/users/${user.id}/posts`),
})
const toViewModel = (user) => ({ display: user.name, postCount: user.posts.length })

const loadProfile = async (id) => {
  const user = await fetchUser(id)
  const enriched = await enrichWithPosts(user)
  return toViewModel(enriched)
}
```