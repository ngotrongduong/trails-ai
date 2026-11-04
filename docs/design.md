# Trails AI v3: design

This is the plan for the rewrite of the AI's core (learning and driving). What already
matches the game exactly is kept: capturing the world and the live engine, building lines
from the game's pieces, reading the Training drills, the rider's low-level controller, and
the judges (the game's grades, its points with the streak, the drills' goals).

## What v2 did, and why it stalls

- A line's plan was learned by riding the **whole line** for every try, from the start:
  a change at metre 280 cost a ride of 280 m to see. Most of the time went into riding
  parts that did not change.
- Which part to change was chosen by a scheduler of seven modes (ride, other, fix, land,
  trick, pump, manual) with many hand-set rules and counters. Every new problem added a
  rule (stuck counters, follow-ups for 40 rounds, records, failure counts...).
- One plan was kept: the single best ride. A choice that is worse now but leads somewhere
  better later (slower here, so the next jump is reachable) was thrown away at once.

## The physics can be saved and restored

The game's physics is WebAssembly with a single linear memory. Measured on a real line
with the game's terrain loaded (46 MB of memory): a ride of 445 steps changes only 11
pages of 4 KB, and the memory does not grow. Copying those pages back puts the game in
exactly the same state: a ride restored this way and ridden on with the same inputs ends
bit for bit where the first one did. So a state is a snapshot of a few dozen KB, taken and
restored in microseconds.

A first version kept a fixed list of the pages rides change, found by comparing the
memory every 300 steps of a few rides. It was not enough: a list inside the game that
grows (a vector reallocated by the allocator) moves into memory no calibration ride had
touched, and a state put back then left the allocator's own records out of step with
the memory around them. On one line the game's code crashed inside the allocator; on
another, two rides out of a few hundred ended differently from the start.

So each worker keeps its memory as it is right after loading the line (the **base**;
pages of zeros are not stored). A state is every page that differs from the base, so
putting one back makes the whole memory exactly as it was. The pages rides write (KP)
are learned on the way: after each lot of tries the pages outside KP are compared with
the base (about 18 ms for 48 MB); when a ride wrote there, those pages join KP and the
lot is ridden again. A try in which the game's code fails counts as a fall, and its lot
is ridden again too. Saved states move between workers: the base is the same in every
worker, which the hash of it checks, and a state taken in one worker and ridden on in
another is compared with the same ride straight through.

A section's state is saved just before the step that first rides into it (the rider is asked where that step will
put the bike): the rider works out its controls every other step, and a state saved one step later already held
controls worked out from the old plan's values for the new section, so a try that changed them rode its first steps
the old way. The best ride of a sweep then ended otherwise from the start in one or two sweeps of every ten to
twenty; since, in none.

Measured: a state is 13 to 40 pages (50 to 160 KB); rides from saved states and from the
start end the same in every check since; a worker rides about 25 tries a second on a
line with few pieces around it, and about 6 times fewer where hundreds of pieces are
close to the line (the game's physics is slower there, not the saved states).

## Learning: a search over sections with saved states

The line is cut into sections as before (one per jump, else every 40 m). A plan holds the
same values per section (speed, or speeds by part, angle in the air, pull, pump, trick and
its timing), so v2 lessons still load.

The search goes along the line section by section, keeping a **beam** of the best few
partial rides. Each one is a saved state at the start of section k with the plan so far
and its score so far (the game's points with the streak, the drill's progress).

For each partial ride, the values for section k are tried many ways at once, in two
rounds (a cross entropy search): first the plan as it is, changed copies of it, and
tries that draw the section anew over the whole range (any speed from 3 to 18 m/s, often
by parts; any angle in the air; a pull or none), plus, on a jump, a grid of take-off
speeds by angles in the air, the values of similar jumps of other lines, and the tricks
chosen per airtime (the trick book); then values taken from the best fifth of the first
round and changed as much as those differ from each other. Tries drawn anew are half of
the tries where the best ride falls, a third once the search has backed up past a
section, a tenth elsewhere (one jump needed 0.94 rad more nose down than the angle worked
out for it, which small changes never reach). A try rides on from the saved state until
the bike has been on the ground 0.75 s in the next section (a jump's landing and how it
rides away decide whether the jump was right), so it costs about a section, not the line.

Tries are compared at that point: first the drill's goal, then whether the bike is still
riding, then (riding) the game's points so far, or (fallen) how far it got.

The best tries become the beam at section k+1, kept different from each other (a fast and
a slow way in to a jump are both kept). When no try of any partial ride gets through
section k, the search **backs up**: it goes back one, two, up to six sections and widens
the tries there (above all the speed), as a rider who keeps failing a jump changes the
way they come at it.

A sweep reaches the end of the line with a full plan (or gives up after 12 backs; the
ride that got furthest is then kept, if it beats the plan held). Every ride that ended
during the sweep (fell, or got to the end) is a full ride from the start; the best of
them is ridden once more from the start, and kept if it beats the plan held so far,
compared as the game would (the drill's goal, how far, the game's points, then the
speed). The plan held always rides through the beam unchanged, so a sweep never loses
it. Further sweeps start from it, as wide again after an improvement, and 1.35 times
wider (up to 2.5) after each sweep that found nothing better.

This replaces all the v2 modes: the first sweep gets through the line, the next ones
make the landings and tricks better, and pumping and manuals are values of the sections
like the rest.

## Driving: on and on

The rider follows the plan as before (steering, speed, the angle in the air, pumps,
tricks). New:

- **Trail finder.** From the end of the last line known, every piece the game has loaded
  around it is laid out; the ridable paths ahead (within 60 m, going roughly the same way,
  not mostly over ground already ridden or planned in this run) are scored and the longest
  of the best six is built into the next line. It can join a line in its middle, not only
  at a start. It looks again every 2 s while riding (the game loads the ground ahead as
  the bike goes), up to two lines ahead.
- **Planning ahead while riding.** As soon as a line is found, its plan is searched for
  in the background (a search of its own on half the threads), from where the bike will
  come onto it and at the speed the plan before says the bike will have there (the
  simulation starts the bike there with that speed). The search goes on while the bike
  rides the line, and a better plan is taken on the way when it rides the part already
  passed the same way. The line after it is looked for once its plan gets to its end.
- **Hand-over.** At the joint the rider switches to the new line and plan without
  stopping; the shared brain rides a line whose plan is not ready yet. Past the end with
  a line found but not ready the bike rides on straight at about 6 m/s.
- **No trail ahead.** With none found, the bike comes down from the last jump, rides it
  out (0.5 s on the ground, 0.75 s past the end) and brakes to a stop, at once if it
  starts rolling back down a slope; then it keeps the brakes on until the player takes
  the bike back. The simulation rides every line's end the same way, and a ride counts
  as finished only once the bike has stopped: before, it stopped counting at the line's
  end, and a lesson that "finished" crashed right after it in the game (it pedalled on
  up the back of a landing, rolled back and fell). The ride goes on until a fall, or
  until there is no trail ahead.
- **Later: correcting on the way.** If the real ride comes into a section much slower or
  faster than the plan expected, the rest of the line could be planned again from there
  (from a saved state made from the real bike's). Not done yet: the game and the
  simulation have matched to the metre so far.
