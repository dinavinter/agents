# Troubleshooting Guide

This guide covers common issues and solutions for the PRD-to-Spec skill.

## Common Issues

### "Invalid task_type" or "task_type argument is required"

**Symptom:** Setup script exits with error about missing or invalid task_type.

**Cause:** The setup script requires a valid task type parameter.

**Solution:**
```bash
# Provide a valid task type when running setup
node /path/to/skills/prd-to-spec/scripts/setup.mjs <task_type>

# Valid task types:
# - agent      (Pro-Code AI Agent for SAP App Foundation)
# - extension  (Side-by-side extension with CAP and custom UI5)
# - n8n        (n8n workflow automation flow)
```

**Example:**
```bash
node /path/to/skills/prd-to-spec/scripts/setup.mjs agent
```

### "Missing required OpenSpec skills"

**Symptom:** Setup script exits with error about missing OpenSpec skills.

**Cause:** The OpenSpec agent skills have not been installed yet.

**Solution:**
Run the workspace setup script to install the required OpenSpec skills.

**Required skills:**
- `openspec-propose` - Create a new change and generate all artifacts in one step
- `openspec-apply-change` - Apply specifications to implement code

### "Config file not found"

**Symptom:** Setup script shows warning about missing config file during step [2/2].

**Cause:** The task-specific config file is missing from the skill's `assets/config_files/` directory.

**Solution:**
1. Verify the skill installation is complete
2. Check that the `assets/config_files/` directory contains:
   - `config-agent.yaml`
   - `config-extension.yaml`
   - `config-n8n.yaml`
3. If files are missing, reinstall the prd-to-spec skill

### "OpenSpec CLI not found"

**Symptom:** Warning about OpenSpec not being installed (or auto-install attempt).

**Auto-installation:**

The setup script will automatically attempt to install OpenSpec if:
- npm is available
- You have permissions for global npm installs

**If auto-install fails:**

1. **Check npm availability:**
   ```bash
   npm --version
   # If not found, install Node.js: https://nodejs.org/
   ```

2. **Check npm permissions:**
   ```bash
   # On Linux/Mac, you may need to configure npm for non-root global installs
   # See: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally
   ```

3. **Manual installation:**
   ```bash
   npm install -g @fission-ai/openspec@latest
   ```

4. **Verify installation:**
   ```bash
   openspec --version
   which openspec
   ```

**Common issues:**

- **npm not installed:** Install Node.js from https://nodejs.org/
- **Permission denied:** Configure npm for non-root installs or use sudo (not recommended)
- **PATH issues:** Ensure npm global bin directory is in your PATH

### Project files not copied

**Symptom:** Setup succeeds but expected project files aren't in current directory.

**Debugging steps:**

1. **Check setup output:**
   - If you see "Note: No project stub found for <task_type>", this means no stub files exist for that task type
   - This is not an error - some task types may not have stub files

2. **Verify current directory:**
   ```bash
   pwd
   # Ensure you're in the intended target directory
   ```

3. **Check permissions:**
   ```bash
   ls -la
   # Ensure you have write permissions
   ```

4. **Verify openspec directory was created:**
   ```bash
   ls -la openspec/
   # Should contain config.yaml
   ```

5. **Re-run setup:**
   ```bash
   node /path/to/skills/prd-to-spec/scripts/setup.mjs <task_type>
   ```

### Agent Skills Not Available

**Symptom:** Agent skills `openspec-propose` or `openspec-apply-change` are not recognized.

**Cause:** Agent has not loaded the OpenSpec skills, or skills were not installed.

**Solution:**

1. **Verify skills were installed:**
   ```bash
   ls -la /path/to/skills/
   # Look for: openspec-propose/, openspec-apply-change/
   ```

2. **If skills are missing:**
   - Run the workspace setup script to install the OpenSpec agent skills.

3. **Remember: These are agent skills, not bash commands:**
   - Use the Skill tool to load them (e.g., load skill `openspec-propose`)
   - **DO NOT** execute them as bash commands (e.g., `./openspec-propose`)

## Additional Resources

- **Setup Reference:** [SETUP.md](SETUP.md)
