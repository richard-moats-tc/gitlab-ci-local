import { ParseContext } from "../src/parser";
import {Rules} from "../src/rules";

test("GITLAB_CI on_success", () => {
    const rules = [
        {if: "$GITLAB_CI == 'false'"},
    ];
    const rulesResult = Rules.evaluate(ParseContext.root.using({GITLAB_CI: "false"}), rules);
    expect(rulesResult?.result).toBe(true);
});

test("Regex on undef var", () => {
    const rules = [
        {if: "$CI_COMMIT_TAG =~ /^v\\d+.\\d+.\\d+/"},
    ];
    const rulesResult = Rules.evaluate(ParseContext.root.using({}), rules);
    expect(rulesResult?.result).toBe(false);
});

test("Negated regex on undef var", () => {
    const rules = [
        {if: "$CI_COMMIT_TAG !~ /^v\\d+.\\d+.\\d+/"},
    ];
    const rulesResult = Rules.evaluate(ParseContext.root.using({}), rules);
    expect(rulesResult?.result).toBe(false);
});

test("GITLAB_CI fail and fallback", () => {
    const rules = [
        {if: "$GITLAB_CI == 'true'"},
        {when: "manual"},
    ];
    const rulesResult = Rules.evaluate(ParseContext.root.using({GITLAB_CI: "false"}), rules);
    expect(rulesResult?.result).toBe(true);
    expect(rulesResult?.rule.when).toEqual("manual");
});

test("Undefined if", () => {
    const rules = [
        {when: "on_success"},
    ];
    const rulesResult = Rules.evaluate(ParseContext.root.using({}), rules);
    expect(rulesResult?.rule.when).toEqual("on_success");
});

test("Undefined when", () => {
    const rules = [
        {if: "$GITLAB_CI", allow_failure: false},
    ];
    const rulesResult = Rules.evaluate(ParseContext.root.using({GITLAB_CI: "false"}), rules);
    expect(rulesResult?.result).toBe(true);
    expect(rulesResult?.rule.allow_failure).toBe(false);
});

test("Early return", () => {
    const rules = [
        {if: "$GITLAB_CI", when: "never"},
        {when: "on_success"},
    ];
    const rulesResult = Rules.evaluate(ParseContext.root.using({GITLAB_CI: "false"}), rules);
    expect(rulesResult?.result).toBe(true);
    expect(rulesResult?.rule.when).toEqual("never");
});

test("VAR exists positive", () => {
    const ruleIf = "$VAR";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "set-value"}), ruleIf);
    expect(val).toBe(true);
});

test("VAR exists fail", () => {
    const ruleIf = "$VAR";
    const val = Rules.evaluateIf(ParseContext.root.using({}), ruleIf);
    expect(val).toBe(false);
});

test("VAR exists empty", () => {
    const ruleIf = "$VAR";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: ""}), ruleIf);
    expect(val).toBe(false);
});

test("VAR not null success", () => {
    const ruleIf = "$VAR != null";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: ""}), ruleIf);
    expect(val).toBe(true);
});

test("VAR not null fail", () => {
    const ruleIf = "$VAR != null";
    const val = Rules.evaluateIf(ParseContext.root.using({}), ruleIf);
    expect(val).toBe(false);
});

test("VAR equals true success", () => {
    const ruleIf = "$VAR == 'true'";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "true"}), ruleIf);
    expect(val).toBe(true);
});

test("VAR equals true fail", () => {
    const ruleIf = "$VAR == 'true'";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "false"}), ruleIf);
    expect(val).toBe(false);
});

test("VAR regex match success", () => {
    const ruleIf = "$VAR =~ /testvalue/";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "testvalue"}), ruleIf);
    expect(val).toBe(true);
});

test("VAR regex match success - case insensitive", () => {
    const ruleIf = "$VAR =~ /testvalue/i";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "testvalue"}), ruleIf);
    expect(val).toBe(true);
});

test("VAR regex match fail", () => {
    const ruleIf = "$VAR =~ /testvalue/";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "spiffy"}), ruleIf);
    expect(val).toBe(false);
});

test("VAR regex match fail - case insensitive", () => {
    const ruleIf = "$VAR =~ /testvalue/i";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "spiffy"}), ruleIf);
    expect(val).toBe(false);
});

test("VAR regex not match success", () => {
    const ruleIf = "$VAR !~ /testvalue/";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "notamatch"}), ruleIf);
    expect(val).toBe(true);
});

test("VAR regex not match success - case insensitive", () => {
    const ruleIf = "$VAR !~ /testvalue/i";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "notamatch"}), ruleIf);
    expect(val).toBe(true);
});

test("VAR regex not match fail", () => {
    const ruleIf = "$VAR !~ /testvalue/";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "testvalue"}), ruleIf);
    expect(val).toBe(false);
});

test("VAR regex not match fail - case insensitive", () => {
    const ruleIf = "$VAR !~ /testvalue/i";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "testvalue"}), ruleIf);
    expect(val).toBe(false);
});

test("VAR regex embedded / match success", () => {
    const ruleIf = "$VAR =~ /test\\/value/";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR: "test/value"}), ruleIf);
    expect(val).toBe(true);
});

test("VAR undefined", () => {
    const ruleIf = "$VAR =~ /123/";
    const val = Rules.evaluateIf(ParseContext.root.using({}), ruleIf);
    expect(val).toBe(false);
});

test("VAR undefined (2nd condition)", () => {
    const ruleIf = "true && $VAR =~ /123/";
    const val = Rules.evaluateIf(ParseContext.root.using({}), ruleIf);
    expect(val).toBe(false);
});

test("Conjunction success", () => {
    const ruleIf = "$VAR1 && $VAR2";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR1: "val", VAR2: "val"}), ruleIf);
    expect(val).toBe(true);
});

test("Conjunction fail", () => {
    const ruleIf = "$VAR1 && $VAR2";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR1: "val", VAR2: ""}), ruleIf);
    expect(val).toBe(false);
});

test("Disjunction success", () => {
    const ruleIf = "$VAR1 || $VAR2";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR1: "val", VAR2: ""}), ruleIf);
    expect(val).toBe(true);
});

test("Disjunction fail", () => {
    const ruleIf = "$VAR1 || $VAR2";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR1: "", VAR2: ""}), ruleIf);
    expect(val).toBe(false);
});

test("Complex parentheses junctions var exists success", () => {
    const ruleIf = "$VAR1 && ($VAR2 || $VAR3)";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR1: "val", VAR2: "val", VAR3: ""}), ruleIf);
    expect(val).toBe(true);
});

test("Complex parentheses junctions var exists fail", () => {
    const ruleIf = "$VAR1 && ($VAR2 || $VAR3)";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR1: "val", VAR2: "", VAR3: ""}), ruleIf);
    expect(val).toBe(false);
});

test("Complex parentheses junctions regex success", () => {
    const ruleIf = "$VAR1 =~ /val/ && ($VAR2 =~ /val/ || $VAR3)";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR1: "val", VAR2: "val", VAR3: ""}), ruleIf);
    expect(val).toBe(true);
});

test("Complex parentheses junctions regex success - case insensitive", () => {
    const ruleIf = "$VAR1 =~ /val/i && ($VAR2 =~ /val/ || $VAR3)";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR1: "VAL", VAR2: "val", VAR3: ""}), ruleIf);
    expect(val).toBe(true);
});

test("Complex parentheses junctions regex fail", () => {
    const ruleIf = "$VAR1 =~ /val/ && ($VAR2 =~ /val/ || $VAR3)";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR1: "val", VAR2: "not", VAR3: ""}), ruleIf);
    expect(val).toBe(false);
});

test("Complex parentheses junctions regex fail - case insensitive", () => {
    const ruleIf = "$VAR1 =~ /val/i && ($VAR2 =~ /val/ || $VAR3)";
    const val = Rules.evaluateIf(ParseContext.root.using({VAR1: "VAL", VAR2: "not", VAR3: ""}), ruleIf);
    expect(val).toBe(false);
});

test("https://github.com/firecow/gitlab-ci-local/issues/350", () => {
    let rules, rulesResult;

    rules = [
        {if: "$CI_COMMIT_BRANCH =~ /master$/", when: "manual"},
    ];
    rulesResult = Rules.evaluate(ParseContext.root.using({CI_COMMIT_BRANCH: "master"}), rules);
    expect(rulesResult?.result).toBe(true);
    expect(rulesResult?.rule.when).toEqual("manual");

    rules = [
        {if: "$CI_COMMIT_BRANCH =~ /$BRANCHNAME/", when: "manual"},
    ];
    rulesResult = Rules.evaluate(ParseContext.root.using({CI_COMMIT_BRANCH: "master", BRANCHNAME: "master"}), rules);
    expect(rulesResult?.result).toBe(false);
});

test("https://github.com/firecow/gitlab-ci-local/issues/300", () => {
    let rules, rulesResult;
    rules = [
        {if: "$VAR1 && (($VAR3 =~ /ci-skip-job-/ && $VAR2 =~ $VAR3) || ($VAR3 =~ /ci-skip-stage-/ && $VAR2 =~ $VAR3))", when: "manual"},
    ];
    rulesResult = Rules.evaluate(ParseContext.root.using({VAR1: "val", VAR2: "ci-skip-job-", VAR3: "ci-skip-job-"}), rules);
    expect(rulesResult?.result).toBe(true);
    expect(rulesResult?.rule.when).toEqual("manual");

    rules = [
        {if: "$VAR1 && (($VAR3 =~ /ci-skip-job-/ && $VAR2 =~ $VAR3) || ($VAR3 =~ /ci-skip-stage-/ && $VAR2 =~ $VAR3))", when: "manual"},
    ];
    rulesResult = Rules.evaluate(ParseContext.root.using({VAR1: "val", VAR2: "ci-skip-stage-", VAR3: "ci-skip-stage-"}), rules);
    expect(rulesResult?.result).toBe(true);
    expect(rulesResult?.rule.when).toEqual("manual");
});
