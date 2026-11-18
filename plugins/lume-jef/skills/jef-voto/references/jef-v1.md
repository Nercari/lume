## 7. JEF-V1 final-draft format

| Directive | Scope | Rule | Permitted exception | Verification | Severity |
| --- | --- | --- | --- | --- | --- |
| `FMT-001` | final judicial draft | The ementa is entirely uppercase and bold. | Express current-product format exception. | Rendered-output check. | critical |
| `FMT-002` | final judicial draft | Do not use a `VOTO-EMENTA` heading. | Express current-product format exception. | Deterministic text check. | critical |
| `FMT-003` | final judicial draft | Do not use Roman-numeral internal sections. | Express current-product format exception. | Deterministic heading check. | critical |
| `FMT-004` | final judicial draft | Number body paragraphs manually and sequentially, with bold only on the number. | Express current-product format exception. | Parser and rendered-output check. | critical |
| `FMT-005` | final judicial draft | Do not bold body text. | Express current-product format exception. | Rendered-output check. | critical |
| `FMT-006` | judicial reasoning | Be concise and nonredundant without collapsing autonomous argumentative functions. | None. | Paragraph-function semantic rubric. | high |
| `FMT-007` | preliminary report | Use the established `1`, `1.1`, `1.2`, `2`, `2.1`, `2.2`, `2.3` hierarchy and stop at requests. | A genuinely different current product. | Ordered-heading and terminal-section check. | critical |
| `FMT-008` | final judicial draft | Place disposition and attorney fees in separate paragraphs when each is independently material. | Fees genuinely not applicable. | Paragraph-role and result-coherence check. | high |
| `FMT-009` | final judicial draft | Do not use automatic lists, internal headings, semicolons, or prohibited body bolding. | Express current-product format exception. | Syntax and rendered-output check. | high |

`JEF-V1` is frozen to the migration matrix and its pinned baseline. A durable
format change requires express approval, RED-first tests, a new vote-format
version, regression, and runtime validation.
