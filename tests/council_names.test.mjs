// Tests for scripts/build_geo.mjs. Run with: npm test
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {ALIASES, coverage, stripMacrons, toMcertName} from "../scripts/build_geo.mjs";

const names = JSON.parse(readFileSync(new URL("./fixtures/council_names.json", import.meta.url), "utf-8"));
const OUTSIDE = "Area Outside Territorial Authority";

test("strips macrons", () => {
  assert.equal(stripMacrons("Ōpōtiki District"), "Opotiki District");
  assert.equal(stripMacrons("Kāpiti Coast District"), "Kapiti Coast District");
});

test("maps Stats NZ names that differ from MCERT's", () => {
  assert.equal(toMcertName("Auckland"), "Auckland (Group)");
  assert.equal(toMcertName("Lower Hutt City"), "Hutt City");
  assert.equal(toMcertName("Chatham Islands Territory"), "Chatham Islands");
  assert.equal(toMcertName("Central Hawke’s Bay District"), "Central Hawke's Bay District");
  assert.equal(toMcertName("Taupō District"), "Taupo District");
});

test("every MCERT council matches exactly one Stats NZ TA", () => {
  const features = names.statsnz
    .filter((n) => n !== OUTSIDE)
    .map((n) => ({properties: {council: toMcertName(n)}}));
  assert.deepEqual(coverage(names.mcert, features), {missing: [], unmatched: []});
  const counts = new Map();
  for (const f of features) counts.set(f.properties.council, (counts.get(f.properties.council) ?? 0) + 1);
  assert.ok([...counts.values()].every((c) => c === 1), "a council matched more than one boundary");
});

test("reports missing and unmatched councils", () => {
  const features = [{properties: {council: "Hutt City"}}, {properties: {council: "Nowhere District"}}];
  assert.deepEqual(coverage(["Hutt City", "Gore District"], features),
    {missing: ["Gore District"], unmatched: ["Nowhere District"]});
});

test("aliases target real MCERT names", () => {
  for (const target of Object.values(ALIASES)) assert.ok(names.mcert.includes(target), target);
});
