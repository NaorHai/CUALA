# CUALA MCP Server - Example Usage

Real-world examples of using CUALA through Claude Desktop via MCP.

## Basic Examples

### 1. Simple Website Test

**User:**
```
Use CUALA to test example.com:
1. Navigate to https://example.com
2. Verify the heading contains "Example Domain"
3. Verify there's a "More information" link
```

**What Claude Does:**
1. Calls `cuala_execute_scenario` with the natural language description
2. CUALA breaks it into steps automatically
3. Returns execution results

**Claude's Response:**
```
✅ Test completed successfully!

Results:
- Step 1: Navigate to https://example.com - ✅ Success
- Step 2: Verify heading "Example Domain" - ✅ Found and verified
- Step 3: Verify "More information" link - ✅ Found

Total execution time: 3.2s
```

---

### 2. Generate Plan Without Execution

**User:**
```
Generate a CUALA test plan for Google search:
1. Go to google.com
2. Search for "Model Context Protocol"
3. Verify results appear

Don't execute it, just show me what steps CUALA would take.
```

**What Claude Does:**
1. Calls `cuala_generate_plan`
2. Shows the generated plan structure
3. Offers to execute or modify

**Claude's Response:**
```
Here's the execution plan CUALA generated:

Plan: "Google Search Verification Test"
Phase: initial

Steps:
1. Action: navigate
   Description: Navigate to https://google.com

2. Action: type
   Description: Type "Model Context Protocol" in search box
   Selector: input[name="q"]
   Value: "Model Context Protocol"

3. Action: click
   Description: Click search button
   Selector: input[name="btnK"]

4. Action: verify
   Description: Verify search results container appears
   Selector: #search

Would you like me to:
- Execute this plan
- Modify any steps
- Save it for later
```

---

### 3. Async Execution with Status Polling

**User:**
```
Run a CUALA test asynchronously to test a slow-loading page:
- Navigate to https://slow-page.example.com
- Wait for content to load
- Verify the page title

Give me the test ID so I can check progress.
```

**What Claude Does:**
1. Calls `cuala_execute_scenario_async`
2. Returns test ID immediately
3. Offers to poll for status

**Claude's Response:**
```
✅ Test started asynchronously!

Test ID: test-abc123-xyz789

The test is now running in the background. I can check the status for you.
Checking status...

Status: running
Progress: 2/3 steps completed
- ✅ Navigate to page
- ✅ Wait for content
- ⏳ Verifying title...

I'll continue monitoring. (Checking again in 5 seconds...)
```

---

## Advanced Examples

### 4. E-commerce Checkout Flow

**User:**
```
Test the checkout flow on demo-shop.example.com:
1. Navigate to the shop
2. Search for "laptop"
3. Click the first product
4. Add to cart
5. Go to checkout
6. Verify cart contains the item
```

**What Claude Does:**
1. Generates comprehensive plan
2. Executes with intelligent element discovery
3. Captures screenshots at each step
4. Reports detailed results

---

### 5. Form Validation Testing

**User:**
```
Test form validation on contact-form.example.com:
1. Navigate to the form
2. Try submitting empty form
3. Verify error messages appear
4. Fill in valid data
5. Submit successfully
```

**What Claude Does:**
1. Tests both negative and positive scenarios
2. Verifies error handling
3. Confirms successful submission
4. Provides comprehensive report

---

### 6. Multi-Page Flow with Authentication

**User:**
```
Test login flow on app.example.com:
1. Navigate to login page
2. Enter email: test@example.com
3. Enter password: Demo123!
4. Click login
5. Verify dashboard appears
6. Check user menu shows correct email
```

**What Claude Does:**
1. Handles form inputs
2. Waits for navigation
3. Verifies post-login state
4. Confirms user-specific content

---

## Configuration Examples

### 7. Adjust Confidence Thresholds

**User:**
```
The element discovery is being too strict and failing to find buttons.
Can you lower the click confidence threshold to 0.6?
```

**What Claude Does:**
1. Calls `cuala_get_confidence_threshold` for 'click'
2. Shows current value
3. Calls `cuala_update_confidence_threshold`
4. Confirms change

**Claude's Response:**
```
Current click confidence threshold: 0.7

I've lowered it to 0.6 as requested.

This means CUALA will accept element matches with 60% confidence or higher
when looking for clickable elements. This should help with finding buttons
that have dynamic classes or non-standard markup.

Current thresholds:
- click: 0.6 ⬅️ (updated)
- type: 0.7
- hover: 0.7
- verify: 0.7
```

---

### 8. View All Configuration

**User:**
```
Show me all current CUALA configuration settings
```

**What Claude Does:**
1. Reads `cuala://config/confidence-thresholds` resource
2. Formats and explains settings

---

## Plan Management Examples

### 9. Review Existing Plans

**User:**
```
Show me all my saved CUALA test plans
```

**What Claude Does:**
1. Calls `cuala_list_plans`
2. Formats results in readable table
3. Shows metadata (created date, phase, step count)

**Claude's Response:**
```
You have 5 test plans:

┌─────┬──────────────────────────┬───────────┬───────┬──────────────┐
│ ID  │ Name                     │ Phase     │ Steps │ Created      │
├─────┼──────────────────────────┼───────────┼───────┼──────────────┤
│ p01 │ Google Search Test       │ refined   │ 4     │ 2 days ago   │
│ p02 │ Login Flow Verification  │ adaptive  │ 6     │ 1 day ago    │
│ p03 │ Checkout Process         │ initial   │ 8     │ 3 hours ago  │
│ p04 │ Form Validation Test     │ refined   │ 5     │ 1 hour ago   │
│ p05 │ API Integration Check    │ initial   │ 3     │ 10 mins ago  │
└─────┴──────────────────────────┴───────────┴───────┴──────────────┘

Would you like details on any specific plan?
```

---

### 10. Execute Existing Plan

**User:**
```
Run the "Login Flow Verification" plan (p02) from my saved plans
```

**What Claude Does:**
1. Gets plan details with `cuala_get_plan`
2. Shows what will be executed
3. Calls `cuala_execute_plan`
4. Reports results

---

### 11. Modify Existing Plan

**User:**
```
Update plan p03 to add a verification step at the end
```

**What Claude Does:**
1. Gets current plan with `cuala_get_plan`
2. Adds the new step
3. Calls `cuala_update_plan`
4. Confirms update

---

## Debugging Examples

### 12. Analyze Failed Test

**User:**
```
Test execution test-xyz789 failed. Can you analyze what went wrong?
```

**What Claude Does:**
1. Calls `cuala_get_status` with test ID
2. Analyzes failure step
3. Reviews screenshots
4. Suggests fixes

**Claude's Response:**
```
Test Failure Analysis for test-xyz789:

❌ Failed at Step 3: Click "Submit" button
   Selector attempted: button.submit-btn
   Error: Element not found

Looking at the DOM snapshot, I can see:
- The button has class "submit-button" (not "submit-btn")
- The button is initially disabled until form is valid
- Form validation hadn't completed yet

Suggested fixes:
1. Add a wait step before clicking submit
2. Update selector to: button.submit-button
3. Add verification that button is enabled before clicking

Would you like me to update the plan with these fixes?
```

---

### 13. Compare Test Runs

**User:**
```
Compare the last two executions of the checkout scenario
```

**What Claude Does:**
1. Calls `cuala_get_history` for scenario
2. Gets the two most recent executions
3. Compares steps, timing, results
4. Highlights differences

---

## Resource Access Examples

### 14. Monitor All Running Tests

**User:**
```
Show me all currently running or pending CUALA tests
```

**What Claude Does:**
1. Reads `cuala://executions/all` resource
2. Filters for running/pending status
3. Shows live progress

**Claude's Response:**
```
Active CUALA Tests:

🏃 Running (2):
- test-abc123: Login Flow Test
  Progress: 4/6 steps (66%)
  Running for: 2m 15s

- test-def456: Search Feature Test
  Progress: 2/5 steps (40%)
  Running for: 45s

⏳ Pending (1):
- test-ghi789: Checkout Flow
  Position in queue: 1
  Estimated start: 30s

Would you like me to monitor these for you?
```

---

### 15. View Historical Patterns

**User:**
```
What's the success rate of the "Login Flow" scenario over the last week?
```

**What Claude Does:**
1. Gets scenario history
2. Analyzes success/failure patterns
3. Identifies common failure points
4. Suggests improvements

---

## Integration Examples

### 16. Create Test Suite

**User:**
```
Create a comprehensive test suite for my-app.com with these scenarios:
1. Homepage load test
2. Search functionality
3. User registration
4. Login flow
5. Profile update
```

**What Claude Does:**
1. Generates plan for each scenario
2. Saves all plans
3. Offers to execute sequentially or in parallel
4. Creates execution report

---

### 17. Scheduled Testing

**User:**
```
Generate a smoke test suite for example.com that I can run daily
```

**What Claude Does:**
1. Creates focused, fast test plans
2. Saves plans with descriptive names
3. Provides command/script to run them
4. Suggests automation setup

---

### 18. Regression Testing

**User:**
```
I deployed a new version. Run all saved test plans to check for regressions.
```

**What Claude Does:**
1. Lists all plans
2. Executes each one
3. Compiles comprehensive report
4. Highlights any new failures

---

## Best Practices

### Tips for Effective Usage

1. **Be Specific**: "Click the blue 'Submit' button in the form" is better than "click submit"

2. **Use Natural Language**: CUALA understands human descriptions better than technical CSS selectors

3. **Break Down Complex Flows**: Split large tests into smaller, reusable plans

4. **Review Plans First**: Use `cuala_generate_plan` to preview before executing

5. **Adjust Thresholds**: If element discovery fails consistently, adjust confidence thresholds

6. **Use Async for Slow Tests**: Long-running tests should use async execution

7. **Save Successful Plans**: Reuse plans that work well by saving and naming them

8. **Monitor Execution**: For critical tests, monitor status during execution

9. **Analyze Failures**: Use Claude to analyze failed tests and suggest fixes

10. **Keep Plans Updated**: Update selectors when site structure changes

---

## Common Patterns

### Pattern: Progressive Enhancement

```
1. Generate plan (dry run)
2. Review and modify if needed
3. Execute with monitoring
4. Analyze results
5. Update plan based on learnings
6. Save for reuse
```

### Pattern: Debugging Flow

```
1. Test fails
2. Get detailed status
3. Review screenshots/errors
4. Identify root cause
5. Update plan/thresholds
6. Re-execute
7. Verify fix
```

### Pattern: Test Suite Development

```
1. Identify critical user flows
2. Generate plans for each
3. Execute and refine
4. Save proven plans
5. Create execution scripts
6. Monitor over time
```

---

## Pro Tips

### Combining Tools

Claude can chain multiple CUALA tools intelligently:

**User:** "Create a login test, run it, and if it fails, analyze why"

Claude will:
1. Generate plan
2. Execute it
3. Get status
4. Analyze failures automatically
5. Suggest fixes

### Using Context

Claude remembers conversation context:

```
User: "Generate a plan for testing google.com search"
Claude: [generates plan, returns ID: p123]

User: "Now execute that plan"
Claude: [executes p123 without asking for ID]

User: "How did it go?"
Claude: [checks status of execution from p123]
```

### Batch Operations

**User:** "Delete all test plans older than 30 days"

Claude can:
1. List all plans
2. Filter by date
3. Delete matching ones
4. Report results

---

**These examples show the power of combining CUALA's browser automation with Claude's intelligence!** 🚀
