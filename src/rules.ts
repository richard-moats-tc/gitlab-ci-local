import {assert} from "./asserts";
import {ParseContext} from "./parser";

export type Rule = { if?: string; when?: string; allow_failure?: boolean };
export type RuleLike = Rule | Rule[];
export class Rules {
    static gitlab_ci_version = 13.12;

    static evaluate(pCtx: ParseContext, rule: RuleLike): { result: boolean; rule: Rule } | undefined {
        if (this.gitlab_ci_version >= 14.2) {
            return Array.isArray(rule) ? this.evalRules(pCtx, rule) : this.evalRule(pCtx, rule);
        } else {
            assert(Array.isArray(rule), "rules must be an array");
            for (const subRule of rule) {
                assert(!Array.isArray(subRule), `GitLab CI v${Rules.gitlab_ci_version} doesn't support nested collections of rules`);
                const finalRule = Rules.evalRule(pCtx, subRule);
                if (finalRule?.result) {
                    return finalRule;
                }
            }
            return {result: false, rule: rule[rule.length - 1]};
        }
    }

    protected static evalRules(pCtx: ParseContext, rules: Rule[]) {
        if (rules) {
            for (const rule of rules) {
                const finalRule = Rules.evaluate(pCtx, rule);
                if (finalRule?.result) {
                    return finalRule;
                }
            }
            return {result: false, rule: rules[rules.length - 1]};
        }
    }

    protected static evalRule(pCtx: ParseContext, rule: Rule) {
        const result = Rules.evaluateIf(pCtx, rule.if || "true");
        if (result) {
            return {result, rule};
        }
    }

    static evaluateIf(pCtx: ParseContext, ruleIf: string): boolean {
        return pCtx.resolving("if", ruleIf).call(pCtx => {
            let evalStr = ruleIf;

            // Expand all variables
            evalStr = evalStr.replace(/[$](\w+)/g, (_, v) => {
                const val = pCtx.resolve(v);
                return (val == null) ? "null" : `'${val}'`;
            });

            // Convert =~ to match function
            evalStr = evalStr.replace(/\s*=~\s*(\/.*?(?<!\\)\/[igmsuy]*)/g, ".match($1) != null");
            evalStr = evalStr.replace(/\s*=~\s(.+?)(\)*?)(?:\s|$)/g, ".match(new RegExp($1)) != null$2"); // Without forward slashes
    
            // Convert !~ to match function
            evalStr = evalStr.replace(/\s*!~\s*(\/.*?(?<!\\)\/[igmsuy]*)/g, ".match($1) == null");
            evalStr = evalStr.replace(/\s*!~\s(.+?)(\)*?)(?:\s|$)/g, ".match(new RegExp($1)) == null$2"); // Without forward slashes
    
            // Convert all null.match functions to false
            evalStr = evalStr.replace(/null.match\(.+?\) != null/g, "false");
            evalStr = evalStr.replace(/null.match\(.+?\) == null/g, "false");

            // noinspection BadExpressionStatementJS
            return eval(`if (${evalStr}) { true } else { false }`) as boolean;
        });
    }
}
