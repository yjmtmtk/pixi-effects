// The tunes of examples/music-lab.html: plain data, no audio files. Each `music` is exactly what an audio layer takes:
//   { type: 'audio', music: <this object> }
// Eight scores written as text: the first by the library author, the other seven by fresh Claude sessions that had only the notation guide
// and a one-line brief (none of them could hear what they wrote).
export const TUNES = [
  {
    "id": "lofi-evening",
    "title": "Lo-fi evening",
    "brief": "a swung lo-fi loop in C major",
    "summary": "Written by the library author as the first test of the notation: Cmaj7 – Am7 – Dm7 – G7 twice, keys, bass, a pluck melody, a pad and a soft groove.",
    "by": "Claude (library author)",
    "music": {
      "bpm": 84,
      "swing": 0.16,
      "reverb": 0.26,
      "seed": 7,
      "humanize": 0.018,
      "tracks": [
        {
          "inst": "keys",
          "vol": 0.7,
          "pan": -0.15,
          "strum": 0.012,
          "notes": "Cmaj7:4 Am7:4 Dm7:4 G7:4 Cmaj7:4 Am7:4 Dm7:2 G7:2 Cmaj7:4"
        },
        {
          "inst": "bass",
          "vol": 0.85,
          "notes": "c2:1.5 _:0.5 g2:1 c2:1 | a1:1.5 _:0.5 e2:1 a1:1 | d2:1.5 _:0.5 a2:1 d2:1 | g1:1.5 _:0.5 d2:1 g1:1 | c2:1.5 _:0.5 g2:1 c2:1 | a1:1.5 _:0.5 e2:1 a1:1 | d2:2 f2:1 a1:1 | g1:2 b1:1 d2:1 | c2:4"
        },
        {
          "inst": "pluck",
          "vol": 0.55,
          "pan": 0.25,
          "step": 0.5,
          "notes": "_:8 | e5:1 d5:0.5 c5:0.5 e5:2 | c5:1 a4:1 e5:2 | f5:1 e5:0.5 d5:0.5 a4:2 | d5:1.5 b4:0.5 g4:2 | e5:1 g5:1 e5:1 d5:1 | c5:1 a4:1 c5:2 | d5:1 f5:1 e5:1 d5:1 | b4:2 d5:2 | c5:4"
        },
        {
          "inst": "pad",
          "vol": 0.5,
          "notes": "[c3 g3 e4]:8 [a2 e3 c4]:8 [d3 a3 f4]:8 [g2 d3 b3]:8"
        }
      ],
      "drums": {
        "kick": "x.......x.x.....",
        "snare": "....x.......x...",
        "hat": "x.x.x.x.x.x.x.xo"
      },
      "drumVol": 0.7
    }
  },
  {
    "id": "lofi",
    "title": "A calm study loop",
    "brief": "a calm, warm lo-fi loop, 30 seconds, for a video about quiet focus: unhurried, gently swung, a melody that is not just a scale",
    "summary": "C major, 80 bpm: Fmaj7 – Em7 – Dm7 – G7, then Am7 and a Dm9, a sus4 cadence into a held Cmaj9. Rootless voicings, a motif and its answer.",
    "by": "a fresh Claude session",
    "music": {
      "bpm": 80,
      "swing": 0.16,
      "reverb": 0.24,
      "humanize": 0.014,
      "seed": 7,
      "tracks": [
        {
          "inst": "pad",
          "vol": 0.28,
          "pan": 0,
          "step": 4,
          "legato": 1,
          "notes": "[f2 c3 a3 e4]:4 | [e2 b2 g3 d4]:4 | [d2 a2 f3 c4]:4 | [g2 d3 b3 f4]:4 | [f2 c3 a3 e4]:4 | [a1 e2 c3 g3]:4 | [d2 a2 f3 c4]:4 | [g2 d3 b3 f4]:4 | [f2 c3 a3 e4]:2 [g2 d3 c4 f4]:1 [g2 d3 b3 f4]:1 | [c2 g2 e3 b3 d4]:4"
        },
        {
          "inst": "keys",
          "vol": 0.55,
          "pan": -0.25,
          "step": 1,
          "strum": 0.014,
          "legato": 0.92,
          "notes": "[f3 a3 c4 e4]:1.5! [f3 a3 c4 e4]:1, [f3 a3 c4 e4]:1.5, | [e3 g3 b3 d4]:2! _:0.5 [e3 g3 b3 d4]:0.5, [e3 g3 b3 d4]:1, | [f3 a3 c4 d4]:1.5! [f3 a3 c4 d4]:1, [f3 a3 c4 d4]:1.5, | [f3 b3 d4 e4]:1.5! [f3 b3 d4 e4]:0.5, _:1 [f3 b3 d4 e4]:1, | [f3 a3 c4 e4]:1.5! [f3 a3 c4 e4]:1, [f3 a3 c4 e4]:1.5, | [g3 a3 c4 e4]:2! _:0.5 [g3 a3 c4 e4]:0.5, [g3 a3 c4 e4]:1, | [f3 a3 c4 e4]:1.5! [f3 a3 c4 e4]:0.5, _:1 [f3 a3 c4 e4]:1, | [f3 b3 d4 e4]:2! _:0.5 [f3 b3 d4 e4]:0.5, [f3 b3 d4 e4]:1, | [f3 a3 c4 e4]:2! [f3 c4 d4 g4]:1, [f3 b3 d4 g4]:1 | [g3 b3 d4 e4]:4!"
        },
        {
          "inst": "lead",
          "vol": 0.42,
          "pan": 0.2,
          "step": 1,
          "legato": 0.95,
          "notes": "_:1 c5:1 a4:0.5 c5:0.5 e5:1 | d5:1.5 b4:0.5 g4:2 | _:1 a4:1 d5:0.5 f5:0.5 e5:1 | d5:1.5 b4:0.5 g4:1 d5:1 | _:0.5 c5:0.5 f5:1 e5:0.5 c5:0.5 a4:1 | e5:1.5 c5:0.5 a4:2 | _:0.5 a4:0.5 d5:1 f5:1.5 e5:0.5 | d5:1 b4:1 g4:2 | a4:0.5 c5:0.5 e5:1 c5:1 b4:1 | e5:1 d5:0.5 c5:2.5"
        },
        {
          "inst": "bass",
          "vol": 0.62,
          "pan": 0,
          "step": 1,
          "legato": 0.9,
          "notes": "f2:1.5 _:0.5 c3:1 a2:1 | e2:1 e2:0.5, _:0.5 b2:1.5 g2:0.5, | d2:1.5 _:0.5 a2:1 f2:1 | g2:1 g2:0.5, _:0.5 d3:1.5 b2:0.5, | f2:1.5 _:0.5 c3:1 a2:1 | a1:1 a1:0.5, _:0.5 e2:1.5 c2:0.5, | d2:1.5 _:0.5 a2:1 f2:1 | g2:1.5 _:0.5 d3:1 b2:1 | f2:2 g2:1 g2:0.5, b2:0.5, | c2:4"
        },
        {
          "inst": "bell",
          "vol": 0.22,
          "pan": 0.45,
          "step": 1,
          "legato": 1,
          "notes": "_:16 | _:2 e6:0.5 c6:1.5 | _:4 | _:2 a5:0.5 f5:0.5 _:1 | g5:1, _:3 | _:3 b5:1, | c6:3 _:1"
        }
      ],
      "drums": {
        "kick": "x.....o...x.....x....o....x..o..x.....o...x.....x....o....x..o..x.....o...x.....x....o....x..o..x.....o...x.....x....o....x..o..x.....o...x.....x...............",
        "snare": "....................o.......o.......o.......o.......o.......o.......o.......o.......o.......o.......o.......o.......o.......o.......o.......o...................",
        "hat": "x.o.x.o.x.o.x.o.x.o.x.o.x.o.x.oox.o.x.o.x.o.x.o.x.o.x.o.x.o.x.oox.o.x.o.x.o.x.o.x.o.x.o.x.o.x.oox.o.x.o.x.o.x.o.x.o.x.o.x.o.x.oox.o.x.o.x.o.x.o...o...o.........",
        "openhat": "..............................................................o...............................................................o................................."
      },
      "drumVol": 0.55
    }
  },
  {
    "id": "heroic",
    "title": "Launch day",
    "brief": "an uplifting, heroic opening for a product-launch video, 20 seconds, that builds: sparse, then layers, a peak, a clear final chord",
    "summary": "D major, 120 bpm, 10 bars: I – vi – IV – V twice with a hook that leaps a fourth and climbs; drums change per section (written as one 160-step pattern).",
    "by": "a fresh Claude session",
    "music": {
      "bpm": 120,
      "reverb": 0.2,
      "humanize": 0.006,
      "seed": 7,
      "tracks": [
        {
          "inst": "pad",
          "vol": 0.5,
          "pan": 0,
          "step": 4,
          "legato": 1,
          "notes": "D:4 Bm:4 G:4 A:4 D:4 Bm:4 G:4 A:4 G:2 A:2 D:4"
        },
        {
          "inst": "pad",
          "vol": 0.35,
          "pan": 0.2,
          "step": 4,
          "legato": 1,
          "notes": "_:16 D@4:4 Bm@4:4 G@4:4 A@4:4 G@4:2 A@4:2 D@4:4"
        },
        {
          "inst": "bell",
          "vol": 0.4,
          "pan": 0.35,
          "legato": 1,
          "notes": "_:2 a5:1 d6:1 d6:1.5 b5:0.5 f#5:2 g5:0.5 b5:1 d6:0.5 g6:1.5 d6:0.5 a5:1 c#6:1 e6:2 _:8 b5:0.5 d6:1 g6:0.5 b6:1.5 a6:0.5 e6:0.5 a6:1 e6:0.5 c#6:1 e6:0.5 a5:0.5 d7:1 b6:0.5 g6:0.5 c#7:1 a6:1 d7:4"
        },
        {
          "inst": "pluck",
          "vol": 0.42,
          "pan": -0.35,
          "legato": 0.9,
          "notes": "_:8 g3:0.5 b3:0.5 d4:0.5 g4:0.5 d4:0.5 b3:0.5 d4:0.5 g4:0.5 a3:0.5 c#4:0.5 e4:0.5 a4:0.5 e4:0.5 c#4:0.5 e4:0.5 a4:0.5 d4:0.5 f#4:0.5 a4:0.5 d5:0.5 a4:0.5 f#4:0.5 a4:0.5 d5:0.5 b3:0.5 d4:0.5 f#4:0.5 b4:0.5 f#4:0.5 d4:0.5 f#4:0.5 b4:0.5 g3:0.5 b3:0.5 d4:0.5 g4:0.5 d4:0.5 b3:0.5 d4:0.5 g4:0.5 a3:0.5 c#4:0.5 e4:0.5 a4:0.5 e4:0.5 c#4:0.5 e4:0.5 a4:0.5 g3:0.5 b3:0.5 d4:0.5 g4:0.5 a3:0.5 c#4:0.5 e4:0.5 a4:0.5 _:4"
        },
        {
          "inst": "keys",
          "vol": 0.5,
          "pan": 0.25,
          "strum": 0.008,
          "legato": 0.8,
          "notes": "_:16 D@3:1.5 D@3:1.5 D@3:1 Bm@3:1.5 Bm@3:1.5 Bm@3:1 G@3:1.5 G@3:1.5 G@3:1 A@3:1.5 A@3:1.5 A@3:1 G:2 A:2 D:4"
        },
        {
          "inst": "bass",
          "vol": 0.75,
          "pan": 0,
          "legato": 0.9,
          "notes": "_:8 g2:2 g2:1 g2:1 a2:2 a2:1 a2:1 d2:0.5 d2:0.5 d3:0.5 d2:0.5 d2:0.5 d2:0.5 d3:0.5 d2:0.5 b2:0.5 b2:0.5 b3:0.5 b2:0.5 b2:0.5 b2:0.5 b3:0.5 b2:0.5 g2:0.75 g2:0.25 g3:0.5 g2:0.5 g2:0.75 g2:0.25 g3:0.5 a2:0.5 a2:0.75 a2:0.25 a3:0.5 a2:0.5 a2:0.75 a2:0.25 a3:0.5 g2:0.5 g2:1 g2:0.5 g3:0.5 a2:1 a2:0.5 a3:0.5 d2:4"
        },
        {
          "inst": "lead",
          "vol": 0.62,
          "pan": -0.05,
          "legato": 0.95,
          "notes": "_:16 a4:0.5 d5:1 f#5:0.5 a5:1.5 f#5:0.5 f#5:1 d5:0.5 b4:1 d5:0.5 f#5:1 b4:0.5 d5:1 g5:0.5 b5:1.5 a5:0.5 e5:0.5 a5:1 e5:0.5 c#5:1 e5:0.5 a4:0.5 d6:1 b5:0.5 g5:0.5 c#6:1 a5:1 d6:4"
        }
      ],
      "drums": {
        "kick": "................................o...............x.......x.......x...x...x...x...x...x...x...x.x.x...x...x...x..xx...x...x..xx.x.x...x...x...x...x...............",
        "snare": "........................................................o.o.xxxx....x.......x.......x.......x.......x.......x.......x.......xxxx....x.......x...................",
        "clap": "....................................................................................................x.......x.......x.......x.......x.......x...................",
        "hat": "................................o.o.o.o.o.o.o.o.o.o.o.o.o.o.o.o.o.x.o.x.o.x.o.x.o.x.o.x.o.x.o.x.xoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxoxo................",
        "openhat": "......................................................................o.......o.......o.......o.x.....x.......x.......x.......x.x.....x.......x.x...............",
        "tom": "............................................................................................xoxx........................x.x.x..................................."
      },
      "drumVol": 0.8
    }
  },
  {
    "id": "jingle",
    "title": "A jingle for a learning app",
    "brief": "a short, bright, playful jingle for a children's learning app, 12 seconds, call and response, ending clearly on the tonic",
    "summary": "C major, 126 bpm, 6 bars: a short-short-long motif over C – G – F – G→C, a tag that climbs, a bell run on the last bar.",
    "by": "a fresh Claude session",
    "music": {
      "bpm": 126,
      "swing": 0.08,
      "reverb": 0.18,
      "humanize": 0.008,
      "seed": 7,
      "tracks": [
        {
          "inst": "lead",
          "vol": 0.62,
          "pan": 0,
          "legato": 0.92,
          "notes": "g4:0.5 c5:0.5 e5:1 g5:0.5 e5:0.5 c5:1 | b4:0.5 d5:0.5 g5:1 f5:1 d5:1 | a4:0.5 c5:0.5 f5:1 a5:0.5 f5:0.5 c5:1 | b4:0.5 d5:0.5 g5:1 e5:0.5 d5:0.5 c5:1 | f5:0.5 a5:0.5 c6:1 g5:0.5 d5:0.5 g5:0.5 b5:0.5 | c6:2! _:2"
        },
        {
          "inst": "keys",
          "vol": 0.5,
          "pan": -0.3,
          "step": 0.5,
          "strum": 0.008,
          "legato": 0.55,
          "notes": "_ [e4 g4 c5] _ [e4 g4 c5] _ [e4 g4 c5] _ [e4 g4 c5] | _ [d4 g4 b4] _ [d4 g4 b4] _ [d4 g4 b4] _ [d4 g4 b4] | _ [c4 f4 a4] _ [c4 f4 a4] _ [c4 f4 a4] _ [c4 f4 a4] | _ [d4 g4 b4] _ [d4 g4 b4] _ [e4 g4 c5] _ [e4 g4 c5] | _ [c4 f4 a4] _ [c4 f4 a4] _ [d4 g4 b4] _ [d4 f4 b4] | [c4 e4 g4 c5]:2! _:2"
        },
        {
          "inst": "bass",
          "vol": 0.7,
          "pan": 0,
          "legato": 0.8,
          "notes": "c2:0.5 c3:0.5 g2:0.5 c3:0.5 c2:0.5 c3:0.5 g2:0.5 c3:0.5 | g1:0.5 g2:0.5 d2:0.5 g2:0.5 g1:0.5 g2:0.5 d2:0.5 g2:0.5 | f1:0.5 f2:0.5 c2:0.5 f2:0.5 f1:0.5 f2:0.5 c2:0.5 f2:0.5 | g1:0.5 g2:0.5 d2:0.5 g2:0.5 c2:0.5 c3:0.5 g2:0.5 c3:0.5 | f1:0.5 f2:0.5 c2:0.5 f2:0.5 g1:0.5 g2:0.5 d2:0.5 g2:0.5 | c2:0.5! c3:0.5 c2:3"
        },
        {
          "inst": "bell",
          "vol": 0.4,
          "pan": 0.35,
          "legato": 0.95,
          "notes": "_:3 e6:0.25 g6:0.25 c7:0.5 | _:3 d6:0.25 g6:0.25 b6:0.5 | _:3 f6:0.25 a6:0.25 c7:0.5 | _:2 e6:0.5 g6:0.5 c7:1 | _:1 a6:0.5 c7:0.5 _:1 g6:0.5 b6:0.5 | c6:0.25 e6:0.25 g6:0.25 c7:1.25 _:2"
        }
      ],
      "drums": {
        "kick": "x.....x.x.......x.....x.x.......x.....x.x.......x.....x.x.......x.....x.x.......x...............",
        "snare": "....x.......x.......x.......x.......x.......x.......x.......x.......x.....x.xxxxx...............",
        "hat": "x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.................",
        "openhat": "..............................................................x.................x...............",
        "clap": "................................................................................x..............."
      },
      "drumVol": 0.7
    }
  },
  {
    "id": "dark",
    "title": "Title sequence, thriller",
    "brief": "a tense, dark, minimal piece for a thriller title sequence, 25 seconds, almost no drums, space and silence on purpose, an unresolved ending",
    "summary": "D minor with a flat sixth, 66 bpm: a sine heartbeat, an open-fifth pad, a four-note bell theme that ends on the tritone, a ticking rim, a bare A5 at the end.",
    "by": "a fresh Claude session",
    "music": {
      "bpm": 66,
      "reverb": 0.4,
      "humanize": 0.01,
      "seed": 7,
      "tracks": [
        {
          "inst": "pad",
          "vol": 0.55,
          "pan": 0,
          "legato": 1,
          "strum": 0.05,
          "notes": "_:4 [d2 a2 d3]:4 [d2 a2 d3 f3]:4 [bb1 f2 a2 d3]:4 [d2 a2 eb3 g3 bb3]:4 [a1 e2 a2 e3]:4"
        },
        {
          "inst": "pad",
          "vol": 0.4,
          "pan": 0.15,
          "legato": 1,
          "strum": 0.2,
          "notes": "_:14 [d4 f4 a4]:2, [bb4 d5 g5]:4 [a4 bb4 e5]:4"
        },
        {
          "inst": "bass",
          "vol": 0.6,
          "legato": 0.9,
          "notes": "d2:0.5 _:0.5 d2:0.5, _:2.5 d2:0.5 _:0.5 d2:0.5, _:2.5 _:4 bb1:1 _:1 bb1:0.5, _:0.5 bb1:0.5, _:0.5 d2:0.5! _:0.5 d2:0.5, _:0.5 d2:0.5 _:0.5 d2:0.5, _:0.5 a1:1.5, _:2.5"
        },
        {
          "inst": "bell",
          "vol": 0.45,
          "pan": 0.1,
          "notes": "_:6 a5:2, a5:1.5 bb5:0.5 a5:1 f5:1 _:4 a5:1 bb5:1 a5:1 ab5:1 a5:1, bb5:3,"
        },
        {
          "inst": "pluck",
          "vol": 0.35,
          "pan": -0.25,
          "legato": 0.8,
          "notes": "_:14 d4:1, f4:1, _:0.5 d5:0.5, _:1 f5:0.5, _:0.5 eb5:1, _:4"
        }
      ],
      "drums": {
        "rim": "............................................................o...o...o...o...o..................."
      },
      "drumVol": 0.3
    }
  },
  {
    "id": "xmas-plain",
    "title": "Something Christmassy",
    "brief": "the whole brief was: \"Something Christmassy.\" (25 seconds, original, no quoted melodies)",
    "summary": "G major in a 6/8 lilt, 88 bpm: a music-box intro, a harp-like arpeggio, maj7 / add9 colours, a stepwise falling bass, and a borrowed minor four for the snowy catch in the throat. No drums.",
    "by": "a fresh Claude session",
    "music": {
      "bpm": 88,
      "reverb": 0.27,
      "humanize": 0.009,
      "seed": 12,
      "tracks": [
        {
          "inst": "pad",
          "vol": 0.36,
          "pan": 0,
          "legato": 1,
          "notes": "Gadd9:2.000000 Cmaj7:2.000000 G:2.000000 D:2.000000 Cmaj7:2.000000 Am7:2.000000 Em7:2.000000 E7:2.000000 Am7:2.000000 G:2.000000 G:2.000000 D:2.000000 C5:2.000000 G:2.000000 Cmaj7:2.000000 Gadd9:2.000000"
        },
        {
          "inst": "bass",
          "vol": 0.55,
          "pan": 0,
          "legato": 0.9,
          "notes": "_:4 g2:1.000000 d3:1.000000 | f#2:1.000000 e2:1.000000 | c2:1.000000 b1:1.000000 | a1:1.000000 d2:1.000000 | e2:1.000000 b2:1.000000 | e2:1.000000 b2:1.000000 | a1:1.000000 c2:1.000000 | b1:1.000000 d2:1.000000 | g2:1.000000 d3:1.000000 | f#2:1.000000 e2:1.000000 | c2:1.000000 c2:1.000000 | b1:1.000000 g2:1.000000 | c2:1.000000 g2:1.000000 | g2:2.000000"
        },
        {
          "inst": "pluck",
          "vol": 0.7,
          "pan": -0.28,
          "legato": 1,
          "notes": "_:2.000000 g3!:0.333333 b3,:0.333333 e4,:0.333333 g4,:0.333333 d4,:0.333333 c4,:0.333333 | g3!:0.333333 b3,:0.333333 d4,:0.333333 g4,:0.333333 d4,:0.333333 b3,:0.333333 | a3!:0.333333 d4,:0.333333 f#4,:0.333333 g4,:0.333333 d4,:0.333333 b3,:0.333333 | g3!:0.333333 b3,:0.333333 e4,:0.333333 f#4,:0.333333 d4,:0.333333 a3,:0.333333 | a3!:0.333333 c4,:0.333333 e4,:0.333333 f#4,:0.333333 d4,:0.333333 c4,:0.333333 | _:8  g3!:0.333333 b3,:0.333333 d4,:0.333333 g4,:0.333333 d4,:0.333333 g4,:0.333333 | a3!:0.333333 d4,:0.333333 f#4,:0.333333 g4,:0.333333 d4,:0.333333 g4,:0.333333 | g3!:0.333333 b3,:0.333333 e4,:0.333333 a4,:0.333333 eb4,:0.333333 a4,:0.333333 | b3!:0.333333 d4,:0.333333 g4,:0.333333 g4,:0.333333 d4,:0.333333 g4,:0.333333 | g3!:0.333333 b3,:0.333333 e4,:0.333333 g4,:0.333333 e4,:0.333333 g4,:0.333333 | g3!:0.333333 b3,:0.333333 d4,:0.333333 a4,:0.333333 d4,:0.333333 a4,:0.333333"
        },
        {
          "inst": "keys",
          "vol": 0.2,
          "pan": 0.25,
          "strum": 0.022,
          "legato": 0.98,
          "notes": "_:12 Em7:2 | E7:2 | Am7:1 Cm6:1 | G/B:1 Dsus4:1 | G:2 | D/F#:1 Em7:1 | Cmaj7:1 Cm6:1 | G/B:1 G:1 | Cmaj7,:2.000000 Gadd9,:2.000000"
        },
        {
          "inst": "lead",
          "vol": 0.95,
          "pan": 0.05,
          "legato": 0.96,
          "notes": "_:2.000000 _:2.000000 | d5:1.000000 b4:0.666667 c5:0.333333 | d5:0.666667 e5:0.333333 g5!:1.000000 | e5:0.666667 c5:0.333333 a4:0.666667 b4:0.333333 | c5:0.666667 a4:0.333333 d5:1.000000 | e5:0.666667 g5:0.333333 b5!:1.000000 | g#5!:0.666667 e5:0.333333 d5:0.666667 b4:0.333333 | c5:0.666667 b4:0.333333 eb5:0.666667 d5:0.333333 | b4:1.000000 c5:0.666667 a4:0.333333 | d5:1.000000 g5:0.666667 f#5:0.333333 | e5:0.666667 d5:0.333333 b4:1.000000 | e5:0.666667 c5:0.333333 eb5:0.666667 c5:0.333333 | d5:1.000000 b4:1.000000 | e5:1.000000 d5:1.000000 | g5!:2.000000"
        },
        {
          "inst": "bell",
          "vol": 0.3,
          "pan": 0.1,
          "legato": 1,
          "notes": "g5,:0.333333 b5,:0.333333 d6,:0.333333 b5,:0.333333 d6,:0.333333 g6!:0.333333 | e5,:0.333333 g5,:0.333333 b5,:0.333333 a5,:0.333333 d6,:0.333333 g6!:0.333333 | g6:1.000000 _:1.000000 | f#6:1.000000 e6:1.000000 | c6:1.000000 b5:1.000000 | a5:1.000000 d6:1.000000 | _:8  | d6!:1.000000 g6,:1.000000 | e6,:1.000000 b5,:1.000000 | e6,:1.000000 eb6,:1.000000 | d6,:1.000000 b5,:1.000000 | e6,:0.333333 g6,:0.333333 b6,:0.333333 c7,:0.333333 b6,:0.333333 g6,:0.333333 | [g5 b5 d6 g6]:2.000000,"
        }
      ]
    }
  },
  {
    "id": "xmas-sleigh",
    "title": "Sleigh ride",
    "brief": "an upbeat, cheerful Christmas sleigh-ride piece for a shop's sale video, 20 seconds, with a sleigh-bell feel built from what exists",
    "summary": "G major then up a step to A major, 144 bpm, swung: an oom-pah bass that starts to walk, glock pings on the off-beats for the bells, hats and rim for the hooves.",
    "by": "a fresh Claude session",
    "music": {
      "bpm": 144,
      "swing": 0.16,
      "reverb": 0.2,
      "humanize": 0.008,
      "seed": 7,
      "tracks": [
        {
          "inst": "lead",
          "vol": 0.8,
          "pan": 0,
          "step": 1,
          "legato": 0.92,
          "notes": "g4:0.5 b4:0.5 d5:1 d5:0.5 e5:0.5 d5:1 c5:1 b4:0.5 a4:0.5 b4:1 a4:1 e5:0.5 e5:0.5 g5:1 e5:0.5 d5:0.5 c5:1 d5:1.5 b4:0.5 b4:0.5 c#5:0.5 d5:0.5 e5:0.5 a4:0.5 c#5:0.5 e5:1 e5:0.5 f#5:0.5 a5:1 d5:1 c#5:0.5 b4:0.5 c#5:1 e5:1 f#5:0.5 a5:0.5 d6:1 b5:0.5 a5:0.5 f#5:1 e5:0.5 g#5:0.5 b5:1 d6:0.5 c#6:0.5 b5:1 c#6:0.5 a5:0.5 e5:1 f#5:0.5 a5:0.5 d6:0.5 c#6:0.5 a5!:4"
        },
        {
          "inst": "bass",
          "vol": 0.85,
          "pan": 0,
          "step": 1,
          "legato": 0.75,
          "notes": "g2 _ d3 b2 a2 _ d3 e3 c3 e3 a2 c3 g2 b2 e2 g#2 a2 e3 a2 c#3 b2 d3 e2 e3 d3 f#3 b2 d3 e3 d3 b2 g#2 a2 e3 d3 e3 a2!:4"
        },
        {
          "inst": "keys",
          "vol": 0.5,
          "pan": -0.3,
          "step": 1,
          "strum": 0.01,
          "legato": 0.5,
          "notes": "_ G _ G _ Am7 _ D7 _ C _ Am7 _ G _ E7 _ A _ A _ Bm7 _ E7 _ D _ Bm7 _ E7 _ E7 _ A _ D A!:4"
        },
        {
          "inst": "pluck",
          "vol": 0.42,
          "pan": 0.35,
          "step": 1,
          "strum": 0.012,
          "legato": 0.45,
          "notes": "_:16 _:0.5 A:0.5 _:0.5 A:0.5 _:0.5 A:0.5 _:0.5 A:0.5 _:0.5 Bm7:0.5 _:0.5 Bm7:0.5 _:0.5 E7:0.5 _:0.5 E7:0.5 _:0.5 D:0.5 _:0.5 D:0.5 _:0.5 Bm7:0.5 _:0.5 Bm7:0.5 _:0.5 E7:0.5 _:0.5 E7:0.5 _:0.5 E7:0.5 _:0.5 E7:0.5 _:0.5 A:0.5 _:0.5 A:0.5 _:0.5 D:0.5 _:0.5 D:0.5 A!:4"
        },
        {
          "inst": "pad",
          "vol": 0.33,
          "pan": 0,
          "step": 1,
          "legato": 1,
          "notes": "_:16 A:4 Bm7:2 E7:2 D:2 Bm7:2 E7:4 A:2 D:2 A:4"
        },
        {
          "inst": "bell",
          "vol": 0.5,
          "pan": 0.15,
          "step": 0.5,
          "legato": 0.5,
          "notes": "_ d6 _ b5 _ d6 _ g6 _ c6 _ e6 _ d6 _ f#6 _ e6 _ g6 _ e6 _ c6 _ d6 _ g6 _ g#6 _ b5 _:0.5 c#6:0.25 e6:0.25 _:0.5 e6:0.25 a6:0.25 _:0.5 c#6:0.25 e6:0.25 _:0.5 e6:0.25 a6:0.25 _:0.5 d6:0.25 f#6:0.25 _:0.5 f#6:0.25 b6:0.25 _:0.5 e6:0.25 g#6:0.25 _:0.5 g#6:0.25 b6:0.25 _:0.5 d6:0.25 f#6:0.25 _:0.5 f#6:0.25 a6:0.25 _:0.5 d6:0.25 f#6:0.25 _:0.5 f#6:0.25 b6:0.25 _:0.5 e6:0.25 g#6:0.25 _:0.5 g#6:0.25 b6:0.25 _:0.5 d6:0.25 g#6:0.25 _:0.5 g#6:0.25 b6:0.25 _:0.5 c#6:0.25 e6:0.25 _:0.5 e6:0.25 a6:0.25 _:0.5 d6:0.25 f#6:0.25 _:0.5 f#6:0.25 a6:0.25 [a5 c#6 e6]:1 a5:0.25 c#6:0.25 e6:0.25 a6:0.25 a6:2"
        }
      ],
      "drums": {
        "kick": "x.......x.....o.x.......x.....o.x.......x.....o.x.......x.......x...o...x...o...x...o...x...o...x...o...x...o...x...o...x.......x...o...x...o...x...............",
        "snare": "....o.......o.......o.......o.......o.......o.......o.......ooxx....x.......x.......x.......x.......x.......x.......x...ooooxxxx....x.......x...x...............",
        "rim": ".......x.......x.......x.......x.......x.......x.......x.......x.......x.......x.......x.......x.......x.......x.......x.......x.......x.......x................",
        "hat": "o.xoo.xoo.xoo.xoo.xoo.xoo.xoo.xoo.xoo.xoo.xoo.xoo.xoo.xoo.xoo.xoooxoooxoooxoooxoooxoooxoooxoooxoooxoooxoooxoooxoooxoooxoooxoooxoooxoooxoooxoooxo................",
        "openhat": "..............x...............x...............x...............x.x.....x.......x.......x.......x.......x.......x.......x.........x.....x.......x.x...............",
        "clap": "................................................................x...............................................................x...............x..............."
      },
      "drumVol": 0.7
    }
  },
  {
    "id": "xmas-snow",
    "title": "Christmas Eve lullaby",
    "brief": "a quiet, tender Christmas Eve lullaby for a snowy night, 28 seconds, 3/4 or 6/8, music box and glockenspiel colours, one touch of borrowed colour",
    "summary": "F major, a slow 6/8: a music-box melody that asks a question over C7 and answers it higher, a minor iv in bar 8, snowflake bells only where the tune holds still.",
    "by": "a fresh Claude session",
    "music": {
      "bpm": 72,
      "reverb": 0.34,
      "humanize": 0.015,
      "seed": 24,
      "tracks": [
        {
          "inst": "pad",
          "vol": 0.55,
          "pan": 0,
          "legato": 1,
          "step": 3,
          "notes": "[f2 c3 a3 c4]:6 [d2 a2 f3 c4]:3 [bb2 f3 a3 d4]:3 [g2 d3 f3 bb3]:1.5 [c3 g3 bb3 e4]:1.5 [a2 f3 a3 c4]:3 [d2 a2 f3 c4]:1.5 [g2 d3 f3 bb3]:1.5 [bb2 f3 bb3 d4]:1.5 [bb2 f3 bb3 db4]:1.5 [c3 f3 a3 c4]:1.5 [c3 g3 bb3 e4]:1.5 [f2 c3 g3 a3]:3"
        },
        {
          "inst": "pluck",
          "vol": 0.34,
          "pan": -0.3,
          "legato": 1,
          "strum": 0.03,
          "notes": "f3:0.5 c4,:0.5 a4,:1 c4,:0.5 f4,:0.5 f3:0.5 c4,:0.5 a4,:1 c4,:0.5 f4,:0.5 d3:0.5 a3,:0.5 f4,:1 a3,:0.5 c4,:0.5 bb2:0.5 f3,:0.5 d4,:1 f3,:0.5 a3,:0.5 g2:0.5 d3,:0.5 bb3,:0.5 c3:0.5 g3,:0.5 e4,:0.5 a2:0.5 f3,:0.5 c4,:1 a3,:0.5 f4,:0.5 d3:0.5 a3,:0.5 f4,:0.5 g2:0.5 d3,:0.5 bb3,:0.5 bb2,:1.5 [db4 f4]:1.5, c3:0.5 f3,:0.5 a3,:0.5 c3:0.5 g3,:0.5 e4,:0.5 f3:0.5 c4,:0.5 a4,:2"
        },
        {
          "inst": "bell",
          "vol": 0.55,
          "pan": -0.1,
          "legato": 1,
          "notes": "_:3 a5,:1.5 c6,:1.5 d6,:1 c6,:0.5 a5,:1.5 bb5,:1.5 a5,:0.5 g5,:0.5 f5,:0.5 g5,:1 a5,:0.5 bb5:1.5 c6:1.5 f6:1 e6,:0.5 d6:1 c6,:0.5 bb5:1.5 d6:1.5 db6!:1.5 c6:1.5 bb5,:0.5 g5,:0.5 e5,:0.5 f5,:3"
        },
        {
          "inst": "bell",
          "vol": 0.2,
          "pan": 0.45,
          "legato": 1,
          "notes": "_:2 c7,:1 _:3 _:3 _:3 _:2 g6,:0.5 e6,:0.5 _:3 _:2 f6,:0.5 d6,:0.5 _:3 _:1.5 c7,:0.5 _:1 _:1 a6,:0.5 _:0.5 c7,:1"
        },
        {
          "inst": "keys",
          "vol": 0.22,
          "pan": 0.2,
          "legato": 1,
          "strum": 0.02,
          "notes": "_:15 [a3 c4 f4]:3 [f3 a3 c4]:1.5 [g3 bb3 d4]:1.5 _:1.5 [bb3 db4 f4]:1.5, [c4 f4 a4]:1.5 [bb3 e4 g4]:1.5, [a3 c4 g4]:3,"
        }
      ]
    }
  }
];
