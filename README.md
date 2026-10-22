# Viral Finder

A local web tool that finds topics likely to spread in a niche, then builds a
ready-to-review content kit for the best one.

You enter a niche such as "politics". The app pulls current headlines from
Google News, Reddit and Google Trends, groups related headlines into topics,
scores each topic from 0 to 100, and shows the top 10.

## Setup

Requires Node.js 24 or newer. The code is TypeScript that Node runs directly,
so there is no build step.

```sh
npm install
npm start
```

Then open http://127.0.0.1:5190. To use another port, set `PORT`:

```sh
PORT=5200 npm start
```

## Usage

1. Enter a niche and run the search.
2. Review the ranked topics and their score breakdowns.
3. Click **Build content kit** on a topic. The kit is written to `output/`.

Each kit contains:

- `card.png`: a 4:5 image card with the topic title, niche and score.
- `video.mp4`: a 6-second video built from the card, encoded with the bundled ffmpeg.
- `captions.md`: caption drafts for TikTok, Instagram, X and YouTube Shorts,
  plus three hook lines.
- `sources.md`: the link for each headline, and the license and artist for each
  image. Check these before posting.

Up to six freely licensed images are fetched from Wikimedia Commons.

Generated kits and dependencies are excluded from git.

## Scoring

Each topic's score is the sum of five parts. The breakdown is shown in the UI
so you can see what drove a result.

| Part           | Max | How it is measured                                                  |
| -------------- | --- | ------------------------------------------------------------------- |
| Momentum       | 30  | Number of distinct sources covering the topic, capped at 3.         |
| Recency        | 25  | Age of the newest item, halving every 12 hours.                     |
| Engagement     | 25  | Log-scaled Reddit score plus comments; about 10k reaches the maximum. |
| Niche fit      | 10  | Share of the niche's own keywords that appear in the topic.         |
| Trends overlap | 10  | Whether any topic keyword appears in today's Google Trends searches. |

Headlines are grouped into one topic when their keywords overlap enough (Jaccard
similarity of at least 0.3). Common stopwords are ignored.

The weights are fixed heuristics, not a validated predictor. A high score means
the topic is currently active across sources; it does not guarantee spread.

## Limits

- Reddit blocks anonymous requests from some networks. When that happens, the
  app shows a source warning and continues with the other sources, and the
  engagement signal is missing.
- Results depend on what the sources return at the time you search.

## Tests

```sh
npm run typecheck
npm test
```

The tests cover RSS parsing, topic clustering, scoring, caption generation and
card escaping.
