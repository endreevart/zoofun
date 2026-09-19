# ADR-0026: Draw the friend, then pay

- Status: accepted
- Date: 2026-09-17
- Revised: 2026-09-19 (D-031: local paper only when stills are gone; hatch «Нарисовать ещё» / empty «В сад!» shop)
- Relates: D-005, D-016, D-024, D-026, D-031, ADR-0006, ADR-0024, ADR-0031

## Context

ADR-0024 set the catalog: after the free Zufik the island offers `pack_1` (99 ₽) and `pack_5` («Выгоднее»), with 10/15/20 behind a quiet expand. The island opened that sheet immediately after the first hatch. Drawing was blocked at remaining 0. A parent who closed the shop had no waiting picture — only an empty-quota dock.

The child already has a living Zufik and wants a friend. Showing prices first is the adult path. The drawing should come first; generation still must not start without a credit.

The first ship showed «Создать друга» once (`friendInviteShown` in localStorage). Closing it sent later empty-quota taps to the shop. Families opened the shop and closed it; those who drew the friend paid several times more often.

## Decision

1. ADR-0024 prices and SKUs stay. This decision changes only the order when **stills and 3D are both 0** and a Zufik already lives on the lawn (D-031). While stills remain, the drawing goes to the API as a postcard creature.
2. After a hatch that spends the last still, if there is no waiting paper, the island shows the huge «Создать друга» button. Closing it does not hide the path: a lawn chip «Создать друга» stays until they draw or a 3D pack lands. The overlay may appear again the next time stills hit 0 and 3D is also 0. The hatch screen itself always has «Нарисовать ещё»: it stays active while stills remain. When leftover 3D remains, «В сад!» spends one credit and starts Tripo. When 3D remaining is 0, «В сад!» opens PackSheet (`pack_1` / `pack_5`, 10–20 behind expand). If stills are also 0, «Нарисовать ещё» is inactive.
3. Drawing with stills 0 and 3D 0 (invite, lawn chip, or the usual draw/photo buttons) does not call stylize, does not reserve a credit, and does not plant an egg. The paper stays on the device. The parent `+` on the quota dock still opens the shop. If stills are 0 and leftover 3D remains, drawing is blocked; hatch «В сад!» or Revive spends that 3D.
4. The existing PackSheet and ParentGate then sell this friend. Title talks about this drawing, not «Ваш первый Зуфик ожил!». Card data stays on T-Bank.
5. Closing the shop without paying leaves the waiting paper plus a short «Ему будет скучно» line. Tap opens the shop again, not the pad. It is not an egg and not a `CreatureRow`.
6. After a credit lands, the usual hatch runs on that paper. A pack of five spends one credit on the waiting friend; the rest remain.
7. Island events: `friend.invite`, `friend.draw`, `friend.pay_sheet`, `friend.decline`, `friend.resume`.

## Consequences

- A partial or unpaid friend never appears in the zoo. OpenRouter / Tripo are not called until reserve succeeds.
- Empty stills + empty 3D is draw-friend first, shop second. Unity iteration 01 is unchanged.
