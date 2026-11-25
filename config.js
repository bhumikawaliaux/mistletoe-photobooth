// ============================================================
//  Booth settings — edit these, no other file needs to change
// ============================================================
window.BOOTH_CONFIG = {
  // --- Music (YouTube embed) ---
  music: {
    enabled: true,
    youtubeId: "E8gmARGvPlI", // Wham! – Last Christmas (official video)
    startAt: 71,              // 1:11 — where the session begins
    endAt: 90,                // 1:30 — music stops here
    volume: 80,
  },

  // --- Timing ---
  // Shot times in seconds, counted from `startAt`. Leave null to use `interval`.
  // To get exact times: open the site with ?mark at the end of the URL,
  // press space on every half-line, and paste the printed list here.
  shotTimes: null,          // e.g. [3.1, 5.4, 7.6, 9.9, 12.2, 14.4, 16.7, 18.9]
  interval: 2.35,           // seconds between shots when shotTimes is null (8 shots fit in 1:11–1:30)
  shots: 8,

  // Text shown under the camera for each shot
  prompts: [
    "pose 1 — big smile",
    "pose 2 — hands on cheeks",
    "pose 3 — look away",
    "pose 4 — make a heart",
    "pose 5 — peekaboo",
    "pose 6 — wink",
    "pose 7 — chin on hands",
    "pose 8 — anything goes",
  ],

  // Lyrics shown under the camera, one half-line per shot (8 lines).
  // Type them in yourself. When a line is filled in, it shows instead of the pose prompt.
  lyrics: ["", "", "", "", "", "", "", ""],

  // Little "now playing" line in the frame corner, like the reference
  nowPlaying: "Wham! · Last Christmas",

  // Save photos mirrored like the preview (true) or true orientation (false)
  mirrorPhotos: true,

  // Text in the strip footer. Use "" for none. {date} becomes today's date.
  stripFooter: "mistletoe · {date}",
};
