# Browser API Token Optimizations

Implementation completed for massive token savings in browser automation workflows

## What Was Implemented

### 1. `/scrape` Endpoint (Highest Impact - 80-95% Token Savings)

**Before:**
```bash
curl -s -X POST $VBCDR_API/html -d '{"tabId":"..."}'
# Returns: 500KB HTML (20,000-50,000 tokens)
```

**After:**
```bash
curl -s -X POST $VBCDR_API/scrape -d '{"url":"https://example.com"}'
# Returns: 10-50KB markdown (500-2,500 tokens)
```

**How it works:**
- Uses jina.ai's `r.jina.ai` service to convert HTML → clean markdown
- Automatically strips ads, navigation, footers, scripts
- Extracts main content only
- Works without requiring a browser tab
- Can scrape multiple URLs in parallel

**Privacy note:** jina.ai sees all URLs passed to this endpoint

### 2. `silent` Mode (Medium Impact)

Optional `silent: true` parameter returns minimal `{ok: true, data: {}}` instead of full response data

**Endpoints supporting silent mode:**
- `/click`
- `/type`
- `/scroll`
- `/back`
- `/forward`

**Example:**
```bash
curl -s -X POST $VBCDR_API/click \
  -d '{"tabId":"...","selector":"button","silent":true}'
# Returns: {"ok":true,"data":{}} instead of {"ok":true,"data":{"success":true}}
```

**Savings:** ~50-100 bytes per action (minor but adds up in automation)

### 3. `/clickAndWait` Batch Endpoint (Medium-High Impact)

Combines click → waitForSelector → optional text extraction into one call

**Before (3 separate calls):**
```bash
curl -s -X POST $VBCDR_API/click -d '{"tabId":"...","selector":"button"}'
curl -s -X POST $VBCDR_API/waitForSelector -d '{"tabId":"...","selector":".results"}'
curl -s -X POST $VBCDR_API/text -d '{"tabId":"...","selector":".results"}'
```

**After (1 call):**
```bash
curl -s -X POST $VBCDR_API/clickAndWait \
  -d '{"tabId":"...","clickSelector":"button","waitSelector":".results","extractText":true}'
```

**Savings:** 300-500 tokens per workflow

### 4. `limit` Parameter for `/querySelector` (Low-Medium Impact)

Allows capping results below the default 50 elements

**Example:**
```bash
curl -s -X POST $VBCDR_API/querySelector \
  -d '{"tabId":"...","selector":"a","limit":5,"all":true}'
# Returns only first 5 matches instead of 50
```

**Savings:** Proportional to limit (limit=5 vs 50 = 90% reduction)

## Expected Token Savings

| Optimization | Token Savings | Use Case |
|-------------|---------------|----------|
| `/scrape` vs `/html` | **80-95%** | Content extraction from web pages |
| `silent` mode | 50-100 bytes | Action confirmations in automation |
| `/clickAndWait` | 300-500 tokens | Click-wait-extract workflows |
| `limit` parameter | Proportional | Targeted queries (e.g., "first 5 links") |

**Combined impact:** For typical browser automation tasks, expect **60-80% overall token reduction**

## Files Modified

### Implementation Files
- `src/main/models/api-types.ts` - Added new TypeScript types
- `src/main/services/http-api.ts` - Implemented new endpoints and parameters

### Documentation Files
- `CLAUDE.md` - Updated project-level documentation
- `~/.claude/CLAUDE.md` - Updated global user instructions

## Testing

Run the test script:
```bash
./test-browser-api.sh
```

Or test manually:

1. **Test `/scrape` endpoint:**
```bash
curl -s -X POST $VBCDR_API/scrape -d '{"url":"https://example.com"}' | jq
```

2. **Test `silent` mode:**
```bash
curl -s -X POST $VBCDR_API/click \
  -d '{"tabId":"TAB_ID","selector":"button","silent":true}'
```

3. **Test `/clickAndWait`:**
```bash
curl -s -X POST $VBCDR_API/clickAndWait \
  -d '{"tabId":"TAB_ID","clickSelector":"button","waitSelector":".result","extractText":true}'
```

4. **Test `limit` parameter:**
```bash
curl -s -X POST $VBCDR_API/querySelector \
  -d '{"tabId":"TAB_ID","selector":"a","limit":3,"all":true}'
```

## Breaking Changes

**None** - all optimizations are opt-in:
- New `/scrape` endpoint (doesn't modify existing endpoints)
- Optional `silent` parameter (defaults to current behavior)
- Optional `limit` parameter (defaults to current 50)
- New `/clickAndWait` endpoint (additive)

## Security Considerations

- jina.ai sees all URLs passed to `/scrape` - documented in privacy notes
- 30-second timeout prevents hanging requests
- All endpoints remain localhost-only (127.0.0.1:7483)
- No URL validation for SSRF yet (consider adding IP filtering in future)

## Next Steps

1. Start vbcdr app
2. Run test script to verify endpoints work
3. Use new optimizations in future browser automation workflows
4. Monitor token usage in Claude conversations to measure actual savings

## Usage Guidelines

**Always prefer:**
1. `/scrape` for content extraction (unless you need browser interaction)
2. `/text` or `/querySelector` for targeted extraction
3. `/clickAndWait` for click-wait-extract workflows
4. `silent: true` for actions when confirmation isn't needed

**Only use `/html` when:**
- You need full DOM inspection
- You need to analyze page structure
- Content extraction tools aren't sufficient
