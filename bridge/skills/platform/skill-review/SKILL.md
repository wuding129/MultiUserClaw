---
name: skill-review
description: "Review and validate skill packages. Use when: admin asks to review a submitted skill, checking SKILL.md format, description quality, compatibility, and completeness."
metadata: { "openclaw": { "requires": { "bins": [] } } }
---

# Skill Review

This skill provides the ability to review and validate skill packages submitted for the curated skill store.

## When to Use

- Admin asks to review a submitted skill
- Checking SKILL.md format and completeness
- Validating skill description quality
- Checking platform compatibility
- Identifying issues or improvements needed

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

### 5. Security & Safety

Check for:
- No suspicious commands or scripts
- No hardcoded credentials or API keys
- No obvious security vulnerabilities

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
  "summary": "Overall assessment"
}
```

## How to Review

### From Source URL

```bash
# Clone the repository
git clone <source_url> /tmp/review-skill

# Check for SKILL.md
ls /tmp/review-skill/
cat /tmp/review-skill/SKILL.md
```

### From Uploaded ZIP

```bash
# Unzip the package
unzip -o <zip_path> -d /tmp/review-skill

# Find SKILL.md
find /tmp/review-skill -name "SKILL.md"
```

### Run Review

After obtaining the SKILL.md content, analyze it against the criteria above and output the review result in JSON format.

## Severity Levels

- **critical**: Must fix before approval (missing SKILL.md, security issues)
- **major**: Should fix before approval (poor description, missing examples)
- **minor**: Nice to have (formatting improvements, additional details)

## Approval Guidelines

- Score >= 80 and no critical issues → Approve
- Score >= 60 and no critical issues → Approve with minor fixes
- Score < 60 or any critical issues → Reject
