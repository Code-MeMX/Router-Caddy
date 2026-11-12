/*
  Copyright (C) 2026 Code Me <licences@code-me.club>

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type BumpType = "major" | "minor" | "patch";

function sh(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function parseSemver(version: string): [number, number, number] {
  const clean = version.replace(/^v/, "").trim();
  const [major = 0, minor = 0, patch = 0] = clean.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return [major, minor, patch];
}

function compareSemver(a: string, b: string): number {
  const [aMaj, aMin, aPat] = parseSemver(a);
  const [bMaj, bMin, bPat] = parseSemver(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

function bumpSemver(version: string, type: BumpType): string {
  const [major, minor, patch] = parseSemver(version);
  if (type === "major") return `${major + 1}.0.0`;
  if (type === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function detectBumpFromCommits(lastTag: string): BumpType {
  const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
  const log = sh(`git log ${range} --pretty=format:"%s%n%b"`);
  if (!log) return "patch";

  const lines = log.split("\n");
  let bump: BumpType = "patch";

  for (const line of lines) {
    if (
      /BREAKING CHANGE/i.test(line) ||
      /^[a-z]+(\([^)]+\))?!:/i.test(line) ||
      /\[major\]/i.test(line)
    ) {
      return "major";
    }
    if (/^feat(\([^)]+\))?:/i.test(line) || /\[minor\]/i.test(line)) {
      bump = "minor";
    }
  }

  return bump;
}

const pkgPath = resolve(process.cwd(), "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const pkgVersion: string = pkg.version || "0.1.0";

const lastTag = sh("git describe --tags --abbrev=0 --match 'v[0-9]*'");
const tagVersion = lastTag ? lastTag.replace(/^v/, "") : "0.0.0";
const baseVersion = compareSemver(pkgVersion, tagVersion) >= 0 ? pkgVersion : tagVersion;

const arg = (process.argv[2] || "auto").toLowerCase();
const dryRun = process.argv.includes("--dry-run");
const noGit = process.argv.includes("--no-git");

const bumpType: BumpType =
  arg === "major" || arg === "minor" || arg === "patch"
    ? arg
    : detectBumpFromCommits(lastTag);

const nextVersion = bumpSemver(baseVersion, bumpType);

if (dryRun) {
  console.log(nextVersion);
  process.exit(0);
}

pkg.version = nextVersion;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
console.log(`Versión actualizada: ${baseVersion} -> ${nextVersion} (${bumpType})`);

if (!noGit) {
  sh("git add package.json");
  sh(`git commit -m "chore(release): v${nextVersion} [skip ci]"`);
  sh(`git tag -a v${nextVersion} -m "Release v${nextVersion}"`);
  console.log(`Tag creado: v${nextVersion}`);
}

