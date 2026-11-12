# Trails AI v4: design

One aim: learn to ride **one fixed line** for as many points as possible, on the player's own computer, and ride it in
the game. Everything else the earlier versions did is gone:
- the shared neural brain;
- training on GitHub;
- Training drills, challenges and tours joined from several lines;
- finding other routes;
- learning from the player's own riding.

## The parts

| file | what it does |
|---|---|
| `src/00-head.js` | the browser memory (IndexedDB, mirrored between tabs), the language, small helpers |
| `src/10-hook.js` | catches the game's physics (`WebAssembly.instantiate`) to get its exports and state. Replaces the player's inputs with the AI's while it drives. Captures the map chunks the game loads. Notices the player's own key presses. |
| `src/20-line.js` | builds the route from the map pieces at the bike: a point a metre along it, each with the ground's kind and width. Gives the route's id. Says whether the bike is at a known line's start. |
| `src/sim/rider.js` | the rider: from a plan and the bike's state it gives the controls. The same code runs in the page and in every worker, so a plan rides the same in both. Also counts a landing's points (`landPoints`). |
| `src/sim/worker.js` | one simulation: the game's own WebAssembly, the line's pieces, rides of a plan, saved states and the try rolls of the search |
| `src/30-pool.js` | the workers (cores − 2, 2 to 8) |
| `src/40-learn.js` | the learner (beam search over the plan) and the trick book |
| `src/50-library.js` | one memory per line, the library index, migration of the old AI's memories |
| `src/60-drive.js` | the session: open a line, learn it, ride it in the game, switch lines, update the AI |
| `src/70-share.js` | share a clean finished ride every 5 minutes: video cuts, 720p video, title, link, chat invite |
| `src/80-ui.js` | the panel |

`tools/build.js` joins `src/NN-*.js` in order. `sim/rider.js` goes in once after `20-line.js` for the page. A second copy goes, together with `sim/worker.js`, into the workers' source (the `/*@WORKER_SRC@*/''` place in `30-pool.js`). The build writes `dist/trails-ai.js`, `docs/index.html` and the extension zip.

## The plan

The line is cut into sections: one per jump (run-up, takeoff and lip), and 40 m pieces elsewhere. A plan holds, per
section:

- `v` the speed to hold (`vs`: one per equal part of the section). 17.5 and up means no limit: pedal while it helps, never brake.
- `pt` the bike's angle to hold in the air.
- `pl` pull up that many metres before the lip.
- `pu` how hard to pump, `pc` how to pump: through the dips the game's Training marks (0), or wherever the ground 1 to 3 m ahead falls away (1, as the old AI did). `ph` pump down the start hill too.
- `lg` the rider's weight on the ground, `sa` steering in the air.
- `tk` the trick program of a jump:
  - `f` backflip;
  - `s` spin left/right, let go at `sr` × 100°, the air angle left alone up to `sf`° round (default `sr` × 100 + 20);
  - `w` whip, let go at `wt` × 0.25 s;
  - `hm` a held move `{b, ln, st, w, h}`: buttons held, a lean, a steer or a whip while the bike is more than `h` m
    above the ground ahead (the old AI's moves 1-15; only with no flip, spin or whip);
  - `q` button tricks one after another, `[code, n, gap]`:
    - T tailwhip, B barspin: `n` turns;
    - L table, G T-bog, X X-up: `n` tenths of a second held;
  - `m` seconds of air kept before landing;
  - `lf` throw to the left;
  - `h` the first button trick's buttons held up the takeoff.

A ride in the air belongs to a jump's section: the lip just passed (3 m or less behind) if there is one, else the jump
of the bike's section or the one before (a hop on a landing is the last jump's). `as: false` (old plans) always takes
the latter.

A button trick starts only once the one before has been caught (frame, bars and lay back within 0.06 rad), after its
gap, and only if the bike's flight, flown on from how it flies now, leaves the trick's time plus `m` before landing
(measured: a tailwhip turn 0.6 s, a barspin 0.37 s, a held trick comes back in about 0.35 s). A trick pressed while
another still turns is ignored by the game, so this is what lets one jump take several tricks and the same trick
several times.

## Points

A landing counts once the bike has been 0.5 s on the ground without a crash. Its worth is the game's Train points and skill points:

- **Train:** base 160 buttery, 140 clean, 100 sketchy, 50 flat or cased (those two end the streak). Add 300 for a backflip, 100 per half turn from a 360 up, 100 for a whip. All of it × the streak, up to 5.
- **Skill points**, each kind once a landing: whip 2, 360 4, flip 6, barspin 3, T-bog 3, X-up 4, tailwhip 5, table 5, +10 for a 360 table.

The AI's points for a landing: Train + 25 × skill points + 15 for every turn a trick went round more than once.

Rides are compared in this order:
1. Finished beats not finished.
2. Then the further.
3. Then the points (each cased landing costs 200 more).
4. Then the faster.

## The search

The worker can save the whole physics state (the WebAssembly memory pages a ride changes, checked bit for bit against a
ride from the start) at a section's start and ride on from it in any worker.

One sweep goes along the line:

1. **Beam.** At section `k` there are up to 6 partial rides, each a saved state and the plan that got there.
2. **First round.** From each partial ride, about 72 tries in all ride section `k`:
   - the plan as it is;
   - no speed limit;
   - the other pump way;
   - pumping down the start hill;
   - on a jump, a grid of 5 speeds × 3 angles, and no tricks;
   - changed copies of the plan (part drawn anew, more of them at the furthest place reached).
   Each try rides until the bike has been on the ground 0.75 s in section `k + 1`.
3. **Second round.** Values are taken from the best fifth of the first round and changed by as much as those differ from each other.
4. **Next beam.** The best tries, kept different in speed, become the beam at `k + 1`. The plan held so far always stays in it, so a sweep never loses it.
5. **Backing up.** If no try gets through, the sweep backs up 1, 2, 4, then 6 sections (12 times at most) and tries those wider.
6. **Check.** The best full ride is ridden again from the start and kept if it beats the held plan. A sweep that finds nothing makes the next one wider.

**Trick book.** Every trick tried off a jump writes a row `[air seconds, trick, landed]` (the last 6000 rows, kept per
unlock mask). A jump's tricks are drawn like a multi-armed bandit: each trick's worth × how often it was landed with about that much air, plus a bonus for tricks tried little. Only tricks the account has unlocked are drawn, as many as the air takes. Spins are drawn as 360, 720 or 1080 (a
720 or 1080 that came round less is booked as not landed). About one draw in seven is a held move instead (`hm`: a steer,
a lean, a whip or buttons held in the air): some lines are ridden only so (n458teqth2 crashes at 48 m without full steer
in the air off its first jumps).

**Fragile sections.** A section is marked fragile when the real ride, on the same plan, did worse than the simulation there:
- it fell where the simulation did not, or
- it came down flat or cased where the simulation landed sketchy or better.

There every try is also ridden 0.3 m/s faster, 0.3 m/s slower and with its tricks 0.06 s later. A try is judged by its worst ride.

## Lines and the library

- **Opening a line.** Start finds the route at the bike: a known line whose start is within 15 m, or the route from the start hill or piece at the bike, run back up to 40 m.
- **Memory.** Each line has one memory (`trailsai.line.<id>`, format `trails-ai-line` v3). It holds the route, the plan, the best simulated ride, the real rides, the fragile sections and the learning history. The index `trailsai.lines` has one row per line for the library list.
- **Switching lines.** When the bike stands still 2.5 s at least 25 m from the current line's start, the AI saves the line and opens the one at the bike, from the library or fresh, and learns on there.
- **Old memories.** The old AI's memories (`trailsai.v2.*` plain lines) are converted once into the new shape, and the originals are kept:
  - its trick moves become trick programs;
  - a plan without `pz` gets `pc` 1 everywhere;
  - a plan without `as` keeps its old way of picking a jump's section.
  Converted plans ride in the new simulation exactly as they did in the old one: on all 9 old lines the two riders gave
  the same controls at every step (checked 2026-11-12). The old manual move (21) is dropped.

## Riding in the game

The page runs the same rider on the live game:
1. **Start.** The AI gets up (the game's own R), spawns at the line's start and rides the best plan.
2. **Better plans mid-ride.** A better plan found during the ride is swapped in if it rides everything already passed the same way.
3. **End of a ride.** It ends at the end of the line (coast and brake), on a crash, more than 12 m off the line, or after 3 s stuck.
4. **After it.** The ride is logged and recorded, its fragile sections are marked, the memory is saved, and it is shared if one is due. Then the next ride starts.

Any key the player presses hands the bike back; the learning goes on.

## Updating

The extension's loader keeps the AI's code in localStorage and runs it on every visit.
- Every 20 minutes the AI checks the code on GitHub.
- When it is newer, the AI saves the line and marks it to resume (`trailsai.resume`, good for 5 minutes). Then it reloads the page between rides and carries on with the same line.

## Testing outside the browser

- `node tools/sim-test.js line.json [plan.json]` loads the game's files into memory (never to disk). It checks the saved states, then rides a plan without and with button tricks.
- `node tools/learn-test.js line.json [sweeps] [workers] [plan.json]` runs the learner in node (its workers share one thread there, so it is slower than in the browser).
