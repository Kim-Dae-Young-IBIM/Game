---
name: harness-review
description: docs/harness-log.md의 실패 기록을 분석해 반복된 항목을 CLAUDE.md, .claude/rules, 스킬, 훅 중 어디로 승격할지 제안하고, CLAUDE.md 비대화와 규칙-산출물 불일치를 점검한다. 사용자가 하네스 점검이나 harness-review를 요청할 때 사용한다.
disable-model-invocation: true
---

# harness-review

하네스 9단계 중 "개선"과 "엔트로피 관리"를 수행한다. **파일은 사용자 승인 후에만 수정한다.**

## 절차

1. `docs/harness-log.md`를 읽고 항목을 유형별로 묶어 횟수를 센다.
2. 아래 기준으로 승격 위치를 제안한다.
   - 같은 실수 2회 → `CLAUDE.md` 해당 섹션 또는 `.claude/rules/`의 경로별 규칙
   - 같은 절차나 프롬프트 3회 → `.claude/skills/`에 새 스킬
   - 문서에 적었는데도 다시 발생, 또는 한 번이라도 치명적 → `.claude/harness.json`의 `forbidden`, `checks`, `verify`
   - 부수 작업이 대화를 오염 → `.claude/agents/`에 서브에이전트
3. 점검한다.
   - `CLAUDE.md`가 200줄을 넘는지, 넘으면 어떤 섹션을 rules나 skills로 옮길지
   - `CLAUDE.md` 2번의 명령과 `.claude/harness.json`의 `verify.command`가 맞는지
   - `.claude/rules/`와 `harness.json`의 규칙 중 지금 산출물과 맞지 않는 것
   - `(미작성)`으로 남은 항목
4. 제안을 표(항목, 횟수, 승격 위치, 추가할 문구)로 보여 주고, 사용자가 고른 것만 반영한다.
5. 반영한 항목은 harness-log의 "조치" 칸에 위치를 적어 닫는다.
