# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via email to: **security@langchain.dev**

Include the following information in your report:

- Description of the vulnerability
- Steps to reproduce the issue
- Potential impact
- Any suggested fixes (optional)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within 48 hours.
- **Updates**: We will provide updates on the status of your report as we investigate.
- **Resolution**: Once the vulnerability is confirmed, we will work on a fix and coordinate disclosure with you.
- **Credit**: We will credit reporters in the release notes (unless you prefer to remain anonymous).

### Scope

This security policy applies to:

- The deepwork desktop application
- The npm package `deepwork`
- This GitHub repository

### Out of Scope

- Third-party dependencies (please report to the respective maintainers)
- LLM provider APIs (Anthropic, OpenAI, Google)
- Social engineering attacks

## Security Best Practices for Users

When using deepwork:

1. **API Keys**: Store API keys securely using environment variables rather than hardcoding them.
2. **Sensitive Data**: Be cautious when giving agents access to directories containing sensitive information.
3. **Human-in-the-Loop**: Use the approval system for sensitive operations.
4. **Updates**: Keep deepwork updated to receive security patches.
