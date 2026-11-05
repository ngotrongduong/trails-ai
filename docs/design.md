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

- **Trail finder.** Every 2 s while riding (the game loads the ground ahead as the bike
  goes), every piece the game has loaded is laid out, and each one's easiest point to get
  onto (every 2 m along it) is found, ridden its own way or the wrong way round. The bike
  can turn off the line it rides at its end (to a line within 60 m) or, more than 30 m
  ahead of the bike, at any point every 5 m where the plan has it on the ground off the
  ramps (to a line within 30 m: one that crosses or passes near it). The way onto a line
  is a curve from there, the way the bike goes, to that point, the way the line goes, with
  no turn tighter than 2.5 m (Hermite curves, the widest of a few). Lines mostly over ground
  already ridden in this run are left out, and so are jump lines ridden the wrong way
  round, unless nothing else is found (the bike would come at the back of each take-off).
  This replaced a finder that joined lines only at their end and only roughly straight on:
  in the game, a line that ended facing a ramp of another line, joined in its middle, was
  "no trail ahead".
- **Trying the ways on.** Up to three ways on are searched for in the background at once
  (a search of their own each, sharing half the threads). Each starts 25 m before its
  curve, at a point where the plan has the bike on the ground, at the speed the plan has
  there (the simulation starts the bike there with that speed). Its search then also
  learns how fast to come at the curve, and whether the slope or the jump after it needs
  more speed. Speed, turns and slopes are judged by the game's own physics, not guessed.
  Starting at the end of the line, with no run-up, every way on from one line fell within
  23 m: the bike came into a dip and a step 4 m on at the speed the plan ended at.
- **Choosing at the turn-off.** When the bike gets to where a way on starts, it goes that
  way if the simulation rides it further than the plan rides on along this line: 15 m
  further for a turn-off before the end, and for any, at least 20 m past its curve. Of
  several, the one ridden furthest (to its end counts 50 m more). The search goes on
  while the bike rides it, a better plan is taken on the way when it rides the part
  already passed the same way, and the ways on from it are looked for.
- **No way on.** With none taken, the bike comes down from the last jump and, after half
  a second on the ground, brakes to a stop, says whether it saw no line or saw some that
  all fell in the simulation, holds the brakes 3 s and rides the line again from its
  start (as after a fall). Only the "Dừng AI lái" button ends driving; the player's keys
  do not. It brakes only going forwards, and hard only where it is level: braking
  while it rolls back tips it over backwards. Two real rides flipped so, one held on the
  brakes on the way up a ramp, one braking gently rolling back at 4 m/s. The simulation
  rides every line's end the same way, and a ride counts as finished only once the bike
  has stopped where it is level and stayed up a second on the brakes. Before, it stopped
  counting at the line's end, and a lesson that "finished" crashed right after it in the
  game (it pedalled on up the back of a landing, rolled back and fell). A ride goes on
  until a fall, or until there is no way on; then the next one starts.
- **Stuck.** A bike nosed gently into a wall of earth does not fall: it stays there, the
  wheel pushing on, for ever. A ride with no metre more along the line in 3 s (in the air
  aside) is over, in the game (and ridden again from the start) as in the simulation
  (before, 8 s there, and nothing in the game), so learning drops such tries at once and
  counts them as falls. Past the end, a bike that never gets level (its nose up a wall)
  counts as stopped after 7 s, as the simulation's 420 steps.
- **The line where the player is (📍).** The piece nearest the player (within 20 m), the
  way they face, starts a line of its own, saved with the lines found. It starts up to
  40 m back along it so the bike has speed by there, never back over a jump; back to a
  start hill, it starts on its deck, at the game's own start there. The first try went
  back over a start hill and set the bike down behind it: every try stuck 3 m up its back.
- **The game's challenges (🏆).** The client asks for `{t:'levels'}` as the game's
  Challenges page does (at most once a minute) and reads the open challenges (day, week,
  event: id, have, need, done) from the reply, and their progress from each `moved` the
  server sends after a run it counts. Each challenge's rule (what it counts, how many, in
  one run or added up) is read from the game's own scripts. Challenges about building
  lines or days played are left to the player. The rest become an aim (landings, clean or
  buttery landings, whips one way or the other, 360s, backflips, manual metres, a row of
  landings each with a trick...), which the simulation counts the way the game does (a
  landing after 0.5 s up, a whip from 45°, a 360 from 300°, a backflip from 270°, a
  manual held 1 s). The line for it is the one nearby whose lesson does most of it in a ride (one added up:
  most a minute), then one learned, then more jumps, then the nearest; a copy of
  that line is learned with the aim as its goal, the way a drill is. Once the simulation
  meets it (or, for one added up over runs, makes some), the bike rides it, learning on in
  the background; 6 minutes with no progress from the server and the way of a whip is
  turned (the game does not say which is "the other way"), or the challenge is set aside.
  Tricks count on the trails only once the account has unlocked them, and tricks in the
  Training drills do not count for challenges; with tricks locked, the AI asks the player
  to open the Trick line drill and learns and rides that, but never presses the game's
  "Unlock tricks".
- **Later: correcting on the way.** If the real ride comes into a section much slower or
  faster than the plan expected, the rest of the line could be planned again from there
  (from a saved state made from the real bike's). Not done yet: the game and the
  simulation have matched to the metre so far.
