# Similar Statement Search - Investigation & Planning

## Problem Statement

Users enter statements (typically answers/options to a question). We need a scalable way to find similar statements for two purposes:

1. **Suggesting alternatives** - Before a user creates a new statement, show them existing similar statements they might want to support instead
2. **Clustering** - Group similar statements together for analysis and display

---

## Questions to Investigate

### 1. Scale Requirements

- What is the current maximum number of statements per question?
- What is the target scale (e.g., 10K, 100K, 1M statements)?
- How many concurrent similarity searches do we expect?

### 2. Use Case Deep Dive

**For suggesting alternatives:**
- When should this happen? (Before submit? During typing?)
- How many similar statements should we show?
- What similarity threshold is "good enough"?
- Should we consider semantic similarity, keyword overlap, or both?

**For clustering:**
- Is clustering done in real-time or batch?
- How many clusters per question?
- Should cluster count be automatic or configurable?
- Do we need hierarchical clustering?

### 3. Current Implementation Analysis

**What's working:**
- 3-layer caching system (response, AI, statement data)
- Parallel processing for performance
- Content moderation integration

**What's limiting:**
- Prompt-based AI approach doesn't scale beyond ~1000 statements
- Full statement fetch every request
- Cache key sensitivity (minor text variations = new AI calls)

### 4. Technology Options to Explore

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| **Embeddings + Vector DB** | Fast, semantic understanding | Initial setup, storage cost | Large scale, real-time |
| **TF-IDF / BM25** | Simple, no external deps | Keyword-only, no semantics | Quick win, small scale |
| **Elasticsearch** | Mature, flexible | Infrastructure overhead | If already using ES |
| **AI Prompt (current)** | Works well now | Doesn't scale | Current small-scale |

### 5. Hybrid Considerations

- Should we combine approaches (e.g., embeddings + keyword boost)?
- Should clustering use different approach than real-time search?
- Can we pre-cluster statements and search within clusters?

---

## Next Steps

1. [ ] Define exact scale requirements
2. [ ] Analyze current statement distribution (statements per question)
3. [ ] Prototype embedding-based search
4. [ ] Compare quality: AI vs embeddings vs keyword
5. [ ] Decide on clustering approach
6. [ ] Cost analysis for each option

---

## Notes

(Space for investigation notes)

