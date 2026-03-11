---
name: skill-review
description: "Review and validate skill packages. Use when: admin asks to review a submitted skill, checking SKILL.md format, description quality, compatibility, and completeness. IMPORTANT: Focus on security - detect skill poisoning, malicious commands, credential theft attempts."
metadata: { "openclaw": { "requires": { "bins": [] } } }
---

# Skill Review

This skill provides the ability to review and validate skill packages submitted for the curated skill store.

## When to Use

- Admin asks to review a submitted skill
- Checking SKILL.md format and completeness
- Validating skill description quality
- Checking platform compatibility
- **Security review - detecting malicious skills**

## Security Review (CRITICAL)

### Skill Poisoning Detection

Watch for these red flags:

1. **Credential Theft**
   - Skills asking for API keys, passwords, tokens
   - Skills that export or log credentials
   - Fake "setup" scripts that steal keys

2. **Data Exfiltration**
   - Skills that send data to external servers
   - Skills that read sensitive files (~/.aws, ~/.ssh, etc.)
   - Skills with suspicious network calls

3. **Malicious Commands**
   - `curl | sh`, `wget | sh` patterns
   - Commands that modify system files
   - Reverse shells or backdoors
   - `rm -rf` without safeguards

4. **Dependency Confusion**
   - Typosquatting package names
   - Fake npm/pip packages
   - Unexpected dependency sources

5. **Obfuscation**
   - Base64 encoded commands
   - Suspicious environment variables
   - Hidden file operations

## Review Criteria

### 1. Format Check

Verify the skill package has:
- `SKILL.md` file in the root or one level deep
- Valid frontmatter with `name` and `description`
- Clear usage instructions

### 2. Description Quality

Check that:
- Description is clear and concise (50-500 characters)
- Description explains what the skill does
- Usage examples are provided if applicable

### 3. Required Dependencies

Check for:
- `required bins` in metadata - verify they are reasonable
- Platform-specific requirements are documented
- External API dependencies are noted

### 4. Compatibility

Check:
- No macOS/iOS specific skills (unless explicitly for those platforms)
- Required binaries are commonly available
- No Windows-specific assumptions

### 5. Security & Safety (MOST IMPORTANT)

Check for:
- **No credential theft attempts** - don't ask for API keys, passwords
- **No data exfiltration** - don't send data to external servers
- **No malicious commands** - no reverse shells, no destructive commands
- **No obfuscation** - no base64 encoded commands
- **No dependency confusion** - verify package names

## Review Output Format

When reviewing a skill, output a JSON object:

```json
{
  "approved": true/false,
  "score": 0-100,
  "issues": [
    {
      "severity": "critical/major/minor",
      "category": "format/description/compatibility/security",
      "message": "Issue description",
      "suggestion": "How to fix"
    }
  ],
  "security_concerns": [
    "Description of security issue if any"
  ],
  "summary": "Overall assessment"
}
```

## Severity Levels

- **critical**: Must fix before approval (security issues, credential theft, malware)
- **major**: Should fix before approval (poor description, missing examples)
- **minor**: Nice to have (formatting improvements, additional details)

## Approval Guidelines

- **ANY security concern → REJECT immediately**
- Score >= 80 and no critical issues → Approve
- Score >= 60 and no critical issues → Approve with minor fixes
- Score < 60 or any critical issues → Reject

## Security First

When in doubt, reject. A malicious skill can compromise all users of the platform.
