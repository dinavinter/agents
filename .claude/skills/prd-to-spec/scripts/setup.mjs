#!/usr/bin/env node
/**
 * PRD-to-Spec Skill Setup Script (Cross-Platform)
 *
 * This script performs the complete setup for the PRD-to-Spec skill:
 * 1. Validates task type parameter
 * 2. Checks that OpenSpec skills are installed
 * 3. Installs/verifies OpenSpec CLI
 * 4. Initializes project based on task type
 *
 * Usage:
 *   node /path/to/skills/prd-to-spec/scripts/setup.mjs <task_type>
 *   task_type can be: agent, extension or n8n
 *
 * Exit codes:
 *   0 - Success
 *   1 - Invalid or missing task_type argument
 *   1 - OpenSpec skills not installed
 *   1 - OpenSpec installation failed
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Valid task types
const VALID_TASK_TYPES = ["agent", "extension", "n8n-workflow"];

/**
 * Execute a command and return the result
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {object} options - Spawn options
 * @returns {​{ success: boolean, stdout: string, stderr: string }}
 */
function runCommand(command, args = [], options = {}) {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf-8",
      shell: process.platform === "win32",
      ...options,
    });
    return {
      success: result.status === 0,
      stdout: (result.stdout || "").trim(),
      stderr: (result.stderr || "").trim(),
    };
  } catch (error) {
    return {
      success: false,
      stdout: "",
      stderr: error.message,
    };
  }
}

/**
 * Check if a command exists in PATH
 * @param {string} command - Command to check
 * @returns {boolean}
 */
function commandExists(command) {
  const checkCmd = process.platform === "win32" ? "where" : "which";
  const result = runCommand(checkCmd, [command]);
  return result.success;
}

/**
 * Copy directory recursively
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Print a separator line
 */
function printSeparator() {
  console.log("============================================");
}

/**
 * Main setup function
 */
function main() {
  const args = process.argv.slice(2);

  // Check if task_type argument is provided
  if (args.length === 0) {
    console.error("Error: task_type argument is required");
    console.error(`Usage: node ${path.basename(__filename)} <task_type>`);
    console.error(`Valid task_type values: ${VALID_TASK_TYPES.join(", ")}`);
    process.exit(1);
  }

  const taskType = args[0];

  // Validate task_type
  if (!VALID_TASK_TYPES.includes(taskType)) {
    console.error(`Error: Invalid task_type '${taskType}'`);
    console.error(`Valid task_type values: ${VALID_TASK_TYPES.join(", ")}`);
    process.exit(1);
  }

  printSeparator();
  console.log("  PRD-to-Spec Skill Setup");
  console.log(`  Task Type: ${taskType}`);
  printSeparator();

  // --- OPENSPEC INSTALLATION & CONFIGURATION ---
  console.log("");
  console.log("[1/2] Setting up OpenSpec...");

  if (commandExists("openspec")) {
    console.log("  \u2713 OpenSpec CLI already installed");
    const versionResult = runCommand("openspec", ["--version"]);
    const openspecVersion = versionResult.success ? versionResult.stdout : "unknown";
    console.log(`    Version: ${openspecVersion}`);
  } else {
    console.log("  - OpenSpec CLI not found, installing...");

    // Check if npm is available
    if (!commandExists("npm")) {
      console.log("  \u2717 npm is not installed");
      console.log("    OpenSpec requires Node.js and npm");
      console.log("    Please install Node.js: https://nodejs.org/");
      process.exit(1);
    }

    // Install OpenSpec globally
    console.log("  - Running: npm install -g @fission-ai/openspec@latest");
    const installResult = runCommand("npm", ["install", "-g", "@fission-ai/openspec@latest"], {
      stdio: "inherit",
    });

    if (installResult.success) {
      console.log("  \u2713 OpenSpec installed successfully");
      const versionResult = runCommand("openspec", ["--version"]);
      const openspecVersion = versionResult.success ? versionResult.stdout : "unknown";
      console.log(`    Version: ${openspecVersion}`);
    } else {
      console.log("  \u2717 Failed to install OpenSpec");
      console.log("    Please try manually: npm install -g @fission-ai/openspec@latest");
      process.exit(1);
    }
  }

  // Disable OpenSpec telemetry
  process.env.OPENSPEC_TELEMETRY = "0";
  console.log("  - OpenSpec telemetry disabled");
  console.log("  \u2713 OpenSpec environment configured");

  // --- INITIALIZE PROJECT ---
  console.log("");
  console.log(`[2/2] Initializing project for task type: ${taskType}...`);

  // Get the directory where the script is located
  const scriptDir = __dirname;
  const projectRoot = path.dirname(scriptDir);

  // Define paths
  const configFilesDir = path.join(projectRoot, "assets", "config_files");
  const projectStubsDir = path.join(projectRoot, "assets", "project_stubs");
  const openspecDir = "openspec";

  // Copy config file to openspec/
  const configFile = `config-${taskType}.yaml`;
  const configPath = path.join(configFilesDir, configFile);

  if (fs.existsSync(configPath)) {
    console.log(`  - Copying ${configFile} to openspec/config.yaml...`);
    if (!fs.existsSync(openspecDir)) {
      fs.mkdirSync(openspecDir, { recursive: true });
    }
    fs.copyFileSync(configPath, path.join(openspecDir, "config.yaml"));
    console.log("  \u2713 Config file copied successfully");
  } else {
    console.log(`  \u2717 Warning: Config file ${configFile} not found at ${configPath}`);
  }

  // Copy project stub if it exists
  const stubPath = path.join(projectStubsDir, taskType);

  if (fs.existsSync(stubPath) && fs.statSync(stubPath).isDirectory()) {
    console.log(`  - Copying project stub from ${taskType} to current directory...`);
    const stubEntries = fs.readdirSync(stubPath, { withFileTypes: true });
    for (const entry of stubEntries) {
      const srcPath = path.join(stubPath, entry.name);
      const destPath = path.join(process.cwd(), entry.name);
      if (entry.isDirectory()) {
        copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
    console.log("  \u2713 Project stub copied successfully");
  } else {
    console.log(`  - Note: Task type ${taskType} does not provide a project stub`);
  }
  console.log("  \u2713 Project initialization complete");

  // --- SUMMARY ---
  console.log("");
  printSeparator();
  console.log("  Setup Complete!");
  printSeparator();
  console.log("");
  console.log(`Task Type: ${taskType}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Review the initialized project files");
  console.log("  2. Use the 'openspec-propose' skill to generate specifications");
  console.log("");
}

// Run the main function
main();
