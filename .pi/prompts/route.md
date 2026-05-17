---
description: Route a normal-language request into the right workflow lane
argument-hint: "<task>"
---
Use this internally when the user types a serious task in normal language and does not name a command.

Run:
`bash ./workflow-router.sh "$ARGUMENTS"`

Then respond compactly with: the current lane, why, whether the task is a north-star, slice-first, research, grill, or direct task, and the single next action.

Do not give the user a command menu. Either proceed with the next action or explain the one next action.
